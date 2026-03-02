"""
Track Store — Local persistence for track data that the app learns over time.

The app is always learning. Pre-built data (like Ruapuna) is a starting point,
but driver edits, AI research, and guide data all enrich the track model.
Every change is saved locally so the app remembers what it learns.
"""
import json
import os
import copy
from datetime import datetime

# Where learned track data lives
_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'tracks')


def _ensure_dir():
    """Create the tracks data directory if it doesn't exist."""
    os.makedirs(_DATA_DIR, exist_ok=True)


def _track_file(track_name):
    """Get the file path for a given track name."""
    # Normalise to lowercase, replace spaces with hyphens
    slug = track_name.lower().strip()
    slug = slug.replace(' ', '-').replace('(', '').replace(')', '')
    slug = slug.replace('/', '-').replace('\\', '-')
    # Remove consecutive hyphens
    while '--' in slug:
        slug = slug.replace('--', '-')
    slug = slug.strip('-')
    return os.path.join(_DATA_DIR, f'{slug}.json')


def has_saved_data(track_name):
    """Check if we have saved data for this track."""
    return os.path.exists(_track_file(track_name))


def load_track(track_name):
    """
    Load saved track data. Returns None if no data exists.
    """
    path = _track_file(track_name)
    if not os.path.exists(path):
        return None
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return None


def save_track(track_model):
    """
    Save track data to local storage.
    Adds metadata about when it was saved and what changed.
    """
    _ensure_dir()
    track_name = track_model.get('trackName', 'unknown')
    path = _track_file(track_name)

    # Add save metadata
    data = copy.deepcopy(track_model)
    data['_lastSaved'] = datetime.now().isoformat()
    data['_saveCount'] = data.get('_saveCount', 0) + 1

    # Track the history of changes
    history = data.get('_history', [])
    history.append({
        'timestamp': datetime.now().isoformat(),
        'action': 'save',
        'cornerCount': len(data.get('corners', [])),
    })
    data['_history'] = history[-20:]  # Keep last 20 entries

    with open(path, 'w') as f:
        json.dump(data, f, indent=2, default=str)

    return path


def merge_ai_research(existing_model, research_result):
    """
    Merge AI research INTO existing track data WITHOUT replacing it.

    Rules:
    - Existing corner count, names, and directions are NEVER overwritten
    - AI research can ADD visual targets, geometry, and notes where they're missing
    - AI research can add supplementary info (trackCharacteristics, notableFeatures)
    - Everything the AI adds is tagged with source='ai_research'
    """
    merged = copy.deepcopy(existing_model)
    research_corners = research_result.get('corners', [])

    existing_corners = merged.get('corners', [])

    # Match by corner number and enrich
    for rc in research_corners:
        rc_num = rc.get('number')
        # Find matching existing corner
        match = None
        for ec in existing_corners:
            if ec.get('number') == rc_num:
                match = ec
                break

        if match:
            # Enrich visual targets if missing
            existing_vt = match.get('visual_targets', {})
            research_vt = rc.get('visual_targets', {})
            for key in ['braking', 'apex', 'exit']:
                if not existing_vt.get(key) and research_vt.get(key):
                    existing_vt[key] = research_vt[key]
                    existing_vt[f'{key}_source'] = 'ai_research'
            if research_vt and not match.get('visual_targets'):
                match['visual_targets'] = existing_vt

            # Enrich geometry if missing
            if not match.get('geometry') and rc.get('geometry'):
                match['geometry'] = rc['geometry']
                match['geometry']['_source'] = 'ai_research'

            # Add racing line notes if missing
            if not match.get('racingLineNotes') and rc.get('racingLineNotes'):
                match['racingLineNotes'] = rc['racingLineNotes']

            # Add hazards if missing
            if not match.get('hazards_visible') and rc.get('hazards_visible'):
                match['hazards_visible'] = rc['hazards_visible']

            # Add AI notes as supplementary (don't replace existing notes)
            if rc.get('notes'):
                existing_notes = match.get('notes', '')
                ai_notes = rc['notes']
                if ai_notes not in existing_notes:
                    match['aiNotes'] = ai_notes

    # Enrich track-level info
    if not merged.get('trackCharacteristics') and research_result.get('trackCharacteristics'):
        merged['trackCharacteristics'] = research_result['trackCharacteristics']
    elif research_result.get('trackCharacteristics'):
        # Append AI characteristics as supplementary
        merged['aiTrackCharacteristics'] = research_result['trackCharacteristics']

    if not merged.get('notableFeatures') and research_result.get('notableFeatures'):
        merged['notableFeatures'] = research_result['notableFeatures']

    if research_result.get('trackLength') and not merged.get('trackLength'):
        merged['trackLength'] = research_result['trackLength']

    # Mark that AI enrichment was applied
    merged['_aiEnriched'] = True
    merged['_aiEnrichedAt'] = datetime.now().isoformat()
    merged['_aiConfidence'] = research_result.get('researchConfidence', 'unknown')

    return merged


def merge_map_analysis(existing_model, map_result):
    """
    Merge track map analysis INTO existing data.
    Map data is trusted for visual targets and geometry (it can see them).
    """
    merged = copy.deepcopy(existing_model)
    map_corners = map_result.get('corners', [])
    existing_corners = merged.get('corners', [])

    for mc in map_corners:
        mc_num = mc.get('number')
        match = None
        for ec in existing_corners:
            if ec.get('number') == mc_num:
                match = ec
                break

        if match:
            # Map visual targets are higher quality — prefer them
            if mc.get('visual_targets'):
                match['visual_targets'] = mc['visual_targets']
                match['visual_targets']['_source'] = 'track_map'

            # Map geometry is measured — prefer it
            if mc.get('geometry'):
                match['geometry'] = mc['geometry']
                match['geometry']['_source'] = 'track_map'

            # Map hazards are visible — add them
            if mc.get('hazards_visible'):
                match['hazards_visible'] = mc['hazards_visible']

    merged['_mapAnalyzed'] = True
    merged['_mapAnalyzedAt'] = datetime.now().isoformat()

    return merged


def merge_guide_data(existing_model, guide_result):
    """
    Merge track guide extraction INTO existing data.
    Guide data is trusted for corner names and racing line notes.
    """
    merged = copy.deepcopy(existing_model)
    guide_corners = guide_result.get('corners', [])
    existing_corners = merged.get('corners', [])

    for gc in guide_corners:
        gc_num = gc.get('number')
        match = None
        for ec in existing_corners:
            if ec.get('number') == gc_num:
                match = ec
                break

        if match:
            # Guide corner names are often the best source
            if gc.get('name'):
                match['name'] = gc['name']

            # Guide notes are valuable
            if gc.get('notes'):
                match['guideNotes'] = gc['notes']

    # Guide direction is reliable
    if guide_result.get('trackDirection') and not merged.get('trackDirection'):
        merged['trackDirection'] = guide_result['trackDirection']

    merged['_guideApplied'] = True
    merged['_guideAppliedAt'] = datetime.now().isoformat()

    return merged


def update_corner(track_model, corner_number, updates):
    """
    Apply user edits to a specific corner.
    User edits always take priority over everything else.

    Args:
        track_model: the current track model dict
        corner_number: which corner to update
        updates: dict of fields to update (name, direction, severity, notes, etc.)

    Returns: updated track model
    """
    model = copy.deepcopy(track_model)
    corners = model.get('corners', [])

    for corner in corners:
        if corner.get('number') == corner_number:
            for key, value in updates.items():
                if value is not None and value != '':
                    corner[key] = value
            corner['_userEdited'] = True
            corner['_editedAt'] = datetime.now().isoformat()
            break

    return model


def add_corner(track_model, corner_data):
    """
    Add a new corner to the track model.
    Inserts in the correct position by corner number.
    """
    model = copy.deepcopy(track_model)
    corners = model.get('corners', [])

    # Insert in order
    inserted = False
    new_num = corner_data.get('number', len(corners) + 1)
    for i, c in enumerate(corners):
        if c.get('number', 0) > new_num:
            corners.insert(i, corner_data)
            inserted = True
            break
    if not inserted:
        corners.append(corner_data)

    model['corners'] = corners
    return model


def remove_corner(track_model, corner_number):
    """
    Remove a corner from the track model.
    Renumbers remaining corners to stay sequential.
    """
    model = copy.deepcopy(track_model)
    corners = model.get('corners', [])

    corners = [c for c in corners if c.get('number') != corner_number]

    # Renumber
    for i, c in enumerate(corners):
        c['number'] = i + 1

    model['corners'] = corners
    return model
