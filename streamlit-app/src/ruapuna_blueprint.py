"""
Ruapuna Blueprint — Pre-built blueprint for Ruapuna Park (Mike Pero Motorsport Park).
Located in Christchurch, New Zealand. Counter-clockwise 3.33 km track with 7 sections.
"""

RUAPUNA_BLUEPRINT = {
    'trackName': 'Ruapuna Park (Mike Pero Motorsport Park)',
    'country': 'New Zealand',
    'location': 'Christchurch',
    'length': '3.33 km',
    'direction': 'counter-clockwise',
    'totalSections': 7,

    'CUE_LABELS': [
        'Eyes Braking Marker — Aware Apex',
        'Eyes Apex — Aware Exit',
        'Eyes Exit — Aware Straight',
        'Eyes Straight — Aware Braking Marker'
    ],

    'WEAK_CORNERS': [3, 5, 7],

    'sections': [
        {
            'number': 1,
            'name': 'Turn 1 – Left Sweeper',
            'direction': 'left',
            'type': 'sweeper',
            'severity': 'medium',
            'isWeak': False,
            'cues': [
                {
                    'pause': 1,
                    'label': 'Eyes Braking Marker — Aware Apex',
                    'eyes': '100m board on right',
                    'aware': 'Left inside kerb paint starting'
                },
                {
                    'pause': 2,
                    'label': 'Eyes Apex — Aware Exit',
                    'eyes': 'Red/white left inside kerb',
                    'aware': 'Track opening left'
                },
                {
                    'pause': 3,
                    'label': 'Eyes Exit — Aware Straight',
                    'eyes': 'Left exit kerb end point',
                    'aware': 'Straight ahead, pit wall'
                },
                {
                    'pause': 4,
                    'label': 'Eyes Straight — Aware Braking Marker',
                    'eyes': 'End of pit wall',
                    'aware': 'Next braking board appearing'
                }
            ]
        },
        {
            'number': 2,
            'name': 'Turn 2-3 – Left Esses',
            'direction': 'left',
            'type': 'esses',
            'severity': 'medium',
            'isWeak': False,
            'cues': [
                {
                    'pause': 1,
                    'label': 'Eyes Braking Marker — Aware Apex',
                    'eyes': 'Brake board left side',
                    'aware': 'First left apex kerb'
                },
                {
                    'pause': 2,
                    'label': 'Eyes Apex — Aware Exit',
                    'eyes': 'Left apex kerb paint',
                    'aware': 'Right exit kerb transition'
                },
                {
                    'pause': 3,
                    'label': 'Eyes Exit — Aware Straight',
                    'eyes': 'Exit kerb end',
                    'aware': 'Short straight to hairpin'
                },
                {
                    'pause': 4,
                    'label': 'Eyes Straight — Aware Braking Marker',
                    'eyes': 'Straight ahead centre',
                    'aware': 'Hairpin brake board'
                }
            ]
        },
        {
            'number': 3,
            'name': 'Turn 4 – Hairpin',
            'direction': 'right',
            'type': 'hairpin',
            'severity': 'very_tight',
            'isWeak': True,
            'weakReps': 3,
            'cues': [
                {
                    'pause': 1,
                    'label': 'Eyes Braking Marker — Aware Apex',
                    'eyes': '50m board right side',
                    'aware': 'Tight inside kerb ahead'
                },
                {
                    'pause': 2,
                    'label': 'Eyes Apex — Aware Exit',
                    'eyes': 'Apex cone/kerb paint',
                    'aware': 'Exit track opening slowly'
                },
                {
                    'pause': 3,
                    'label': 'Eyes Exit — Aware Straight',
                    'eyes': 'Exit kerb end',
                    'aware': 'Back straight opening'
                },
                {
                    'pause': 4,
                    'label': 'Eyes Straight — Aware Braking Marker',
                    'eyes': 'Back straight centre',
                    'aware': 'Next brake reference'
                }
            ]
        },
        {
            'number': 4,
            'name': 'Turn 5-6 – Back Chicane',
            'direction': 'left',
            'type': 'chicane',
            'severity': 'tight',
            'isWeak': False,
            'cues': [
                {
                    'pause': 1,
                    'label': 'Eyes Braking Marker — Aware Apex',
                    'eyes': 'Brake board on approach',
                    'aware': 'First left turn-in point'
                },
                {
                    'pause': 2,
                    'label': 'Eyes Apex — Aware Exit',
                    'eyes': 'Left inside kerb',
                    'aware': 'Right kerb for second part'
                },
                {
                    'pause': 3,
                    'label': 'Eyes Exit — Aware Straight',
                    'eyes': 'Chicane exit kerb',
                    'aware': 'Straight to sweeper'
                },
                {
                    'pause': 4,
                    'label': 'Eyes Straight — Aware Braking Marker',
                    'eyes': 'Track ahead',
                    'aware': 'Sweeper entry approaching'
                }
            ]
        },
        {
            'number': 5,
            'name': 'Turn 7-8 – Long Right Sweeper',
            'direction': 'right',
            'type': 'sweeper',
            'severity': 'fast',
            'isWeak': True,
            'weakReps': 3,
            'cues': [
                {
                    'pause': 1,
                    'label': 'Eyes Braking Marker — Aware Apex',
                    'eyes': 'Entry kerb reference',
                    'aware': 'Long right inside kerb'
                },
                {
                    'pause': 2,
                    'label': 'Eyes Apex — Aware Exit',
                    'eyes': 'Midpoint inside kerb',
                    'aware': 'Track opening towards exit'
                },
                {
                    'pause': 3,
                    'label': 'Eyes Exit — Aware Straight',
                    'eyes': 'Exit kerb paint',
                    'aware': 'Short straight ahead'
                },
                {
                    'pause': 4,
                    'label': 'Eyes Straight — Aware Braking Marker',
                    'eyes': 'Straight ahead',
                    'aware': 'Final corner brake board'
                }
            ]
        },
        {
            'number': 6,
            'name': 'Turn 9-10 – Penultimate Complex',
            'direction': 'left',
            'type': 'medium',
            'severity': 'medium',
            'isWeak': False,
            'cues': [
                {
                    'pause': 1,
                    'label': 'Eyes Braking Marker — Aware Apex',
                    'eyes': 'Brake board left',
                    'aware': 'Inside kerb appearing'
                },
                {
                    'pause': 2,
                    'label': 'Eyes Apex — Aware Exit',
                    'eyes': 'Left kerb midpoint',
                    'aware': 'Exit opening right'
                },
                {
                    'pause': 3,
                    'label': 'Eyes Exit — Aware Straight',
                    'eyes': 'Exit kerb end',
                    'aware': 'Final corner ahead'
                },
                {
                    'pause': 4,
                    'label': 'Eyes Straight — Aware Braking Marker',
                    'eyes': 'Short straight centre',
                    'aware': 'Final corner brake board'
                }
            ]
        },
        {
            'number': 7,
            'name': 'Turn 11 – Final Corner',
            'direction': 'right',
            'type': 'medium',
            'severity': 'medium',
            'isWeak': True,
            'weakReps': 3,
            'cues': [
                {
                    'pause': 1,
                    'label': 'Eyes Braking Marker — Aware Apex',
                    'eyes': 'Final brake board',
                    'aware': 'Right inside kerb'
                },
                {
                    'pause': 2,
                    'label': 'Eyes Apex — Aware Exit',
                    'eyes': 'Apex kerb paint',
                    'aware': 'Pit straight opening'
                },
                {
                    'pause': 3,
                    'label': 'Eyes Exit — Aware Straight',
                    'eyes': 'Exit kerb end point',
                    'aware': 'Start-finish straight'
                },
                {
                    'pause': 4,
                    'label': 'Eyes Straight — Aware Braking Marker',
                    'eyes': 'Start-finish straight centre',
                    'aware': 'Turn 1 brake board appearing'
                }
            ]
        }
    ],

    'trainingProtocol': {
        'dailyMinutes': 15,
        'weeks': [
            {
                'week': 1,
                'speed': 0.5,
                'pauseDuration': 5,
                'method': 'Watch + listen'
            },
            {
                'week': 2,
                'speed': 0.75,
                'pauseDuration': 4,
                'method': 'Look and Call'
            },
            {
                'week': 3,
                'speed': 1.0,
                'pauseDuration': 3,
                'method': 'Audio cues only'
            },
            {
                'week': 4,
                'speed': 1.25,
                'pauseDuration': 2,
                'method': 'Automatic'
            }
        ],
        'lookAndCall': [
            'Eyes Braking Marker — Aware Apex',
            'Eyes Apex — Aware Exit',
            'Eyes Exit — Aware Straight',
            'Eyes Straight — Aware Braking Marker'
        ]
    }
}


def is_ruapuna(track_name):
    """
    Check if track name matches Ruapuna.
    Handles case-insensitive matching for common aliases.
    """
    if not track_name:
        return False
    name = track_name.lower().strip()
    return any(x in name for x in ['ruapuna', 'euromarque', 'mike pero'])


def get_blueprint():
    """Return the pre-built Ruapuna blueprint."""
    return RUAPUNA_BLUEPRINT


def get_track_info():
    """Return track metadata only."""
    return {
        'trackName': RUAPUNA_BLUEPRINT['trackName'],
        'country': RUAPUNA_BLUEPRINT['country'],
        'location': RUAPUNA_BLUEPRINT['location'],
        'length': RUAPUNA_BLUEPRINT['length'],
        'direction': RUAPUNA_BLUEPRINT['direction'],
        'totalSections': RUAPUNA_BLUEPRINT['totalSections']
    }


def get_sections():
    """Return only the sections array."""
    return RUAPUNA_BLUEPRINT['sections']


def get_weak_corners():
    """Return list of weak corner numbers."""
    return RUAPUNA_BLUEPRINT['WEAK_CORNERS']


def get_training_protocol():
    """Return the training protocol."""
    return RUAPUNA_BLUEPRINT['trainingProtocol']


def get_cue_labels():
    """Return the standard cue labels."""
    return RUAPUNA_BLUEPRINT['CUE_LABELS']


def get_section_by_number(section_number):
    """Get a specific section by its number."""
    for section in RUAPUNA_BLUEPRINT['sections']:
        if section['number'] == section_number:
            return section
    return None
