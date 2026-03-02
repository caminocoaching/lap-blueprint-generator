"""
Ruapuna Blueprint — Pre-built blueprint for Ruapuna Park (Mike Pero Motorsport Park).
Located in Christchurch, New Zealand. Counter-clockwise 3.33 km track with 11 corners.

Correct layout (verified by driver):
  T1  Left kink
  T2  Open left
  T3  Left
  T4  Left hairpin
  T5  Kink right
  T6  Tight right
  T7  Sweeping left
  T8  Long right hairpin
  T9  Tight right
  T10 Tight left
  T11 Long hairpin left

7 left-hand corners, 4 right-hand corners.
"""

# ── Ground-truth corner data for the track model ─────────
# This is the format Step 2 expects, so Ruapuna bypasses AI research entirely.

RUAPUNA_CORNERS = [
    {
        'number': 1,
        'name': 'Turn 1 – Pit Straight End',
        'direction': 'left',
        'severity': 'kink',
        'visual_targets': {
            'braking': 'Lift point marker on right',
            'apex': 'Left kink kerb',
            'exit': 'Track straightening past kink'
        },
        'geometry': {
            'radius_estimate': 'open',
            'elevation': 'flat',
            'camber': 'flat'
        },
        'hazards_visible': [],
        'racingLineNotes': 'Flat-out kink, slight lift. Stay left of centre on entry.',
        'notes': 'Fast left kink at the end of the pit straight. Minimal steering input needed.'
    },
    {
        'number': 2,
        'name': 'Turn 2 – Open Left',
        'direction': 'left',
        'severity': 'medium',
        'visual_targets': {
            'braking': 'Brake board left side',
            'apex': 'Left inside kerb',
            'exit': 'Right exit kerb'
        },
        'geometry': {
            'radius_estimate': 'open',
            'elevation': 'flat',
            'camber': 'positive'
        },
        'hazards_visible': ['Grass run-off on outside'],
        'racingLineNotes': 'Open radius left, good vision through. Can carry speed.',
        'notes': 'Open left-hander, reasonably fast. Good visibility to exit.'
    },
    {
        'number': 3,
        'name': 'Turn 3 – Left',
        'direction': 'left',
        'severity': 'medium',
        'visual_targets': {
            'braking': 'Brake reference approaching left kerb',
            'apex': 'Left inside kerb paint',
            'exit': 'Exit kerb, track opening right'
        },
        'geometry': {
            'radius_estimate': 'medium',
            'elevation': 'flat',
            'camber': 'flat'
        },
        'hazards_visible': [],
        'racingLineNotes': 'Medium left, sets up approach to the hairpin.',
        'notes': 'Left corner leading into the hairpin approach.'
    },
    {
        'number': 4,
        'name': 'Turn 4 – Left Hairpin',
        'direction': 'left',
        'severity': 'hairpin',
        'visual_targets': {
            'braking': 'Brake board on right',
            'apex': 'Inside left kerb at tightest point',
            'exit': 'Track opening to back section'
        },
        'geometry': {
            'radius_estimate': 'tight',
            'elevation': 'flat',
            'camber': 'flat'
        },
        'hazards_visible': ['Gravel trap on outside'],
        'racingLineNotes': 'Heavy braking. Late apex to maximise exit speed onto the back section.',
        'notes': 'Slowest left-hand corner on the circuit. Critical to get exit right.'
    },
    {
        'number': 5,
        'name': 'Turn 5 – Kink Right',
        'direction': 'right',
        'severity': 'kink',
        'visual_targets': {
            'braking': 'Lift point reference on left',
            'apex': 'Right side kerb/edge',
            'exit': 'Track straightening ahead'
        },
        'geometry': {
            'radius_estimate': 'open',
            'elevation': 'flat',
            'camber': 'flat'
        },
        'hazards_visible': [],
        'racingLineNotes': 'Fast right kink, minimal input needed. Keep momentum.',
        'notes': 'Quick right kink on the back section. Flat-out or near flat-out.'
    },
    {
        'number': 6,
        'name': 'Turn 6 – Tight Right',
        'direction': 'right',
        'severity': 'tight',
        'visual_targets': {
            'braking': 'Brake board on left',
            'apex': 'Right inside kerb',
            'exit': 'Left exit kerb'
        },
        'geometry': {
            'radius_estimate': 'tight',
            'elevation': 'flat',
            'camber': 'flat'
        },
        'hazards_visible': ['Barrier proximity on outside'],
        'racingLineNotes': 'Hard braking into tight right. Good exit matters for the run to T7.',
        'notes': 'Tight right-hander requiring strong braking.'
    },
    {
        'number': 7,
        'name': 'Turn 7 – Sweeping Left',
        'direction': 'left',
        'severity': 'fast_sweeper',
        'visual_targets': {
            'braking': 'Entry kerb reference',
            'apex': 'Long left inside kerb midpoint',
            'exit': 'Exit kerb, track opening right'
        },
        'geometry': {
            'radius_estimate': 'open',
            'elevation': 'flat',
            'camber': 'positive'
        },
        'hazards_visible': ['Grass run-off outside'],
        'racingLineNotes': 'Sweeping left, need to commit. Long arc — don\'t pinch the exit.',
        'notes': 'Fast sweeping left, requires commitment and smooth steering.'
    },
    {
        'number': 8,
        'name': 'Turn 8 – Long Right Hairpin',
        'direction': 'right',
        'severity': 'hairpin',
        'visual_targets': {
            'braking': 'Brake board on left',
            'apex': 'Right inside kerb at tightest point',
            'exit': 'Track opening to the left'
        },
        'geometry': {
            'radius_estimate': 'tight',
            'elevation': 'flat',
            'camber': 'flat'
        },
        'hazards_visible': ['Gravel trap on outside'],
        'racingLineNotes': 'Long right hairpin — late apex, patience through the slow section.',
        'notes': 'Long right-hand hairpin. Slowest part of the back section.'
    },
    {
        'number': 9,
        'name': 'Turn 9 – Tight Right',
        'direction': 'right',
        'severity': 'tight',
        'visual_targets': {
            'braking': 'Brake reference on left',
            'apex': 'Right inside kerb',
            'exit': 'Exit kerb opening left'
        },
        'geometry': {
            'radius_estimate': 'tight',
            'elevation': 'flat',
            'camber': 'flat'
        },
        'hazards_visible': [],
        'racingLineNotes': 'Tight right, sets up approach to T10.',
        'notes': 'Tight right-hander in the complex before the final corner.'
    },
    {
        'number': 10,
        'name': 'Turn 10 – Tight Left',
        'direction': 'left',
        'severity': 'tight',
        'visual_targets': {
            'braking': 'Brake reference on right',
            'apex': 'Left inside kerb',
            'exit': 'Exit kerb, short straight to final corner'
        },
        'geometry': {
            'radius_estimate': 'tight',
            'elevation': 'flat',
            'camber': 'flat'
        },
        'hazards_visible': [],
        'racingLineNotes': 'Tight left, needs a good exit to carry speed to the final hairpin.',
        'notes': 'Tight left before the final corner. Exit speed is critical.'
    },
    {
        'number': 11,
        'name': 'Turn 11 – Final Hairpin Left',
        'direction': 'left',
        'severity': 'hairpin',
        'visual_targets': {
            'braking': 'Final brake board on right',
            'apex': 'Left inside kerb at tightest point',
            'exit': 'Pit straight opening ahead'
        },
        'geometry': {
            'radius_estimate': 'tight',
            'elevation': 'flat',
            'camber': 'flat'
        },
        'hazards_visible': ['Barrier on outside'],
        'racingLineNotes': 'Long left hairpin onto the pit straight. Late apex for best drive out.',
        'notes': 'Final left hairpin. Drive out onto the pit straight. Critical for lap time.'
    }
]


RUAPUNA_BLUEPRINT = {
    'trackName': 'Ruapuna Park (Mike Pero Motorsport Park)',
    'country': 'New Zealand',
    'location': 'Christchurch',
    'length': '3.33 km',
    'direction': 'counter-clockwise',
    'totalSections': 11,

    'CUE_LABELS': [
        'Eyes Braking Marker — Aware Apex',
        'Eyes Apex — Aware Exit',
        'Eyes Exit — Aware Straight',
        'Eyes Straight — Aware Braking Marker'
    ],

    'WEAK_CORNERS': [4, 8, 11],

    'sections': [
        {
            'number': 1,
            'name': 'Turn 1 – Pit Straight End (Left Kink)',
            'direction': 'left',
            'type': 'kink',
            'severity': 'fast',
            'isWeak': False,
            'cues': [
                {
                    'pause': 1,
                    'label': 'Eyes Braking Marker — Aware Apex',
                    'eyes': 'Lift point reference on right',
                    'aware': 'Left kink kerb approaching'
                },
                {
                    'pause': 2,
                    'label': 'Eyes Apex — Aware Exit',
                    'eyes': 'Left inside kerb at kink',
                    'aware': 'Track straightening ahead'
                },
                {
                    'pause': 3,
                    'label': 'Eyes Exit — Aware Straight',
                    'eyes': 'Kink exit, track opening',
                    'aware': 'Short straight to Turn 2'
                },
                {
                    'pause': 4,
                    'label': 'Eyes Straight — Aware Braking Marker',
                    'eyes': 'Straight ahead',
                    'aware': 'Turn 2 brake reference appearing'
                }
            ]
        },
        {
            'number': 2,
            'name': 'Turn 2 – Open Left',
            'direction': 'left',
            'type': 'medium',
            'severity': 'medium',
            'isWeak': False,
            'cues': [
                {
                    'pause': 1,
                    'label': 'Eyes Braking Marker — Aware Apex',
                    'eyes': 'Brake board left side',
                    'aware': 'Left inside kerb ahead'
                },
                {
                    'pause': 2,
                    'label': 'Eyes Apex — Aware Exit',
                    'eyes': 'Left inside kerb',
                    'aware': 'Right exit kerb visible'
                },
                {
                    'pause': 3,
                    'label': 'Eyes Exit — Aware Straight',
                    'eyes': 'Exit kerb end',
                    'aware': 'Short run to Turn 3'
                },
                {
                    'pause': 4,
                    'label': 'Eyes Straight — Aware Braking Marker',
                    'eyes': 'Straight ahead centre',
                    'aware': 'Turn 3 brake reference'
                }
            ]
        },
        {
            'number': 3,
            'name': 'Turn 3 – Left',
            'direction': 'left',
            'type': 'medium',
            'severity': 'medium',
            'isWeak': False,
            'cues': [
                {
                    'pause': 1,
                    'label': 'Eyes Braking Marker — Aware Apex',
                    'eyes': 'Brake reference on approach',
                    'aware': 'Left inside kerb appearing'
                },
                {
                    'pause': 2,
                    'label': 'Eyes Apex — Aware Exit',
                    'eyes': 'Left kerb paint at apex',
                    'aware': 'Exit opening to the right'
                },
                {
                    'pause': 3,
                    'label': 'Eyes Exit — Aware Straight',
                    'eyes': 'Exit kerb end',
                    'aware': 'Hairpin approach ahead'
                },
                {
                    'pause': 4,
                    'label': 'Eyes Straight — Aware Braking Marker',
                    'eyes': 'Short straight ahead',
                    'aware': 'Hairpin brake board appearing'
                }
            ]
        },
        {
            'number': 4,
            'name': 'Turn 4 – Left Hairpin',
            'direction': 'left',
            'type': 'hairpin',
            'severity': 'very_tight',
            'isWeak': True,
            'weakReps': 3,
            'cues': [
                {
                    'pause': 1,
                    'label': 'Eyes Braking Marker — Aware Apex',
                    'eyes': 'Brake board on right',
                    'aware': 'Left inside kerb ahead'
                },
                {
                    'pause': 2,
                    'label': 'Eyes Apex — Aware Exit',
                    'eyes': 'Inside left kerb at tightest point',
                    'aware': 'Track opening to back section'
                },
                {
                    'pause': 3,
                    'label': 'Eyes Exit — Aware Straight',
                    'eyes': 'Exit, track opening ahead',
                    'aware': 'Back straight beginning'
                },
                {
                    'pause': 4,
                    'label': 'Eyes Straight — Aware Braking Marker',
                    'eyes': 'Back section ahead',
                    'aware': 'Turn 5 kink approaching'
                }
            ]
        },
        {
            'number': 5,
            'name': 'Turn 5 – Kink Right',
            'direction': 'right',
            'type': 'kink',
            'severity': 'fast',
            'isWeak': False,
            'cues': [
                {
                    'pause': 1,
                    'label': 'Eyes Braking Marker — Aware Apex',
                    'eyes': 'Lift point on left',
                    'aware': 'Right kink edge'
                },
                {
                    'pause': 2,
                    'label': 'Eyes Apex — Aware Exit',
                    'eyes': 'Right side kerb',
                    'aware': 'Track straightening'
                },
                {
                    'pause': 3,
                    'label': 'Eyes Exit — Aware Straight',
                    'eyes': 'Kink exit opening',
                    'aware': 'Run to Turn 6'
                },
                {
                    'pause': 4,
                    'label': 'Eyes Straight — Aware Braking Marker',
                    'eyes': 'Straight ahead',
                    'aware': 'Turn 6 brake board'
                }
            ]
        },
        {
            'number': 6,
            'name': 'Turn 6 – Tight Right',
            'direction': 'right',
            'type': 'tight',
            'severity': 'tight',
            'isWeak': False,
            'cues': [
                {
                    'pause': 1,
                    'label': 'Eyes Braking Marker — Aware Apex',
                    'eyes': 'Brake board on left',
                    'aware': 'Right inside kerb ahead'
                },
                {
                    'pause': 2,
                    'label': 'Eyes Apex — Aware Exit',
                    'eyes': 'Right inside kerb',
                    'aware': 'Left exit kerb visible'
                },
                {
                    'pause': 3,
                    'label': 'Eyes Exit — Aware Straight',
                    'eyes': 'Exit kerb, track opening left',
                    'aware': 'Run to sweeping left'
                },
                {
                    'pause': 4,
                    'label': 'Eyes Straight — Aware Braking Marker',
                    'eyes': 'Straight ahead',
                    'aware': 'Turn 7 entry approaching'
                }
            ]
        },
        {
            'number': 7,
            'name': 'Turn 7 – Sweeping Left',
            'direction': 'left',
            'type': 'fast_sweeper',
            'severity': 'fast',
            'isWeak': False,
            'cues': [
                {
                    'pause': 1,
                    'label': 'Eyes Braking Marker — Aware Apex',
                    'eyes': 'Entry kerb reference',
                    'aware': 'Long left inside kerb'
                },
                {
                    'pause': 2,
                    'label': 'Eyes Apex — Aware Exit',
                    'eyes': 'Left inside kerb midpoint',
                    'aware': 'Track opening towards exit'
                },
                {
                    'pause': 3,
                    'label': 'Eyes Exit — Aware Straight',
                    'eyes': 'Exit kerb end',
                    'aware': 'Short run to right hairpin'
                },
                {
                    'pause': 4,
                    'label': 'Eyes Straight — Aware Braking Marker',
                    'eyes': 'Straight ahead',
                    'aware': 'Turn 8 brake board'
                }
            ]
        },
        {
            'number': 8,
            'name': 'Turn 8 – Long Right Hairpin',
            'direction': 'right',
            'type': 'hairpin',
            'severity': 'very_tight',
            'isWeak': True,
            'weakReps': 3,
            'cues': [
                {
                    'pause': 1,
                    'label': 'Eyes Braking Marker — Aware Apex',
                    'eyes': 'Brake board on left',
                    'aware': 'Right inside kerb ahead'
                },
                {
                    'pause': 2,
                    'label': 'Eyes Apex — Aware Exit',
                    'eyes': 'Right inside kerb at tightest point',
                    'aware': 'Track opening to the left'
                },
                {
                    'pause': 3,
                    'label': 'Eyes Exit — Aware Straight',
                    'eyes': 'Exit, track opening',
                    'aware': 'Short straight to Turn 9'
                },
                {
                    'pause': 4,
                    'label': 'Eyes Straight — Aware Braking Marker',
                    'eyes': 'Straight ahead',
                    'aware': 'Turn 9 brake reference'
                }
            ]
        },
        {
            'number': 9,
            'name': 'Turn 9 – Tight Right',
            'direction': 'right',
            'type': 'tight',
            'severity': 'tight',
            'isWeak': False,
            'cues': [
                {
                    'pause': 1,
                    'label': 'Eyes Braking Marker — Aware Apex',
                    'eyes': 'Brake reference on left',
                    'aware': 'Right inside kerb appearing'
                },
                {
                    'pause': 2,
                    'label': 'Eyes Apex — Aware Exit',
                    'eyes': 'Right inside kerb',
                    'aware': 'Exit kerb opening left'
                },
                {
                    'pause': 3,
                    'label': 'Eyes Exit — Aware Straight',
                    'eyes': 'Exit kerb end',
                    'aware': 'Short run to Turn 10'
                },
                {
                    'pause': 4,
                    'label': 'Eyes Straight — Aware Braking Marker',
                    'eyes': 'Straight ahead',
                    'aware': 'Turn 10 brake reference'
                }
            ]
        },
        {
            'number': 10,
            'name': 'Turn 10 – Tight Left',
            'direction': 'left',
            'type': 'tight',
            'severity': 'tight',
            'isWeak': False,
            'cues': [
                {
                    'pause': 1,
                    'label': 'Eyes Braking Marker — Aware Apex',
                    'eyes': 'Brake reference on right',
                    'aware': 'Left inside kerb appearing'
                },
                {
                    'pause': 2,
                    'label': 'Eyes Apex — Aware Exit',
                    'eyes': 'Left inside kerb',
                    'aware': 'Exit, short straight visible'
                },
                {
                    'pause': 3,
                    'label': 'Eyes Exit — Aware Straight',
                    'eyes': 'Exit kerb end',
                    'aware': 'Final corner approach'
                },
                {
                    'pause': 4,
                    'label': 'Eyes Straight — Aware Braking Marker',
                    'eyes': 'Short straight to final corner',
                    'aware': 'Final corner brake board'
                }
            ]
        },
        {
            'number': 11,
            'name': 'Turn 11 – Final Hairpin Left',
            'direction': 'left',
            'type': 'hairpin',
            'severity': 'very_tight',
            'isWeak': True,
            'weakReps': 3,
            'cues': [
                {
                    'pause': 1,
                    'label': 'Eyes Braking Marker — Aware Apex',
                    'eyes': 'Final brake board on right',
                    'aware': 'Left inside kerb ahead'
                },
                {
                    'pause': 2,
                    'label': 'Eyes Apex — Aware Exit',
                    'eyes': 'Left inside kerb at tightest point',
                    'aware': 'Pit straight opening ahead'
                },
                {
                    'pause': 3,
                    'label': 'Eyes Exit — Aware Straight',
                    'eyes': 'Exit, pit straight visible',
                    'aware': 'Start-finish straight'
                },
                {
                    'pause': 4,
                    'label': 'Eyes Straight — Aware Braking Marker',
                    'eyes': 'Start-finish straight centre',
                    'aware': 'Turn 1 kink approaching'
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


def get_track_model():
    """
    Return Ruapuna data in the Step 2 track_model format.
    This lets Ruapuna bypass AI research entirely — ground truth data.
    """
    return {
        'trackName': 'Ruapuna Park (Mike Pero Motorsport Park)',
        'trackLength': '3.33 km',
        'trackDirection': 'counter-clockwise',
        'country': 'New Zealand',
        'trackCharacteristics': (
            'Counter-clockwise 3.33 km circuit in Christchurch. '
            '11 corners: 7 left, 4 right. Mix of hairpins, kinks, and sweepers. '
            'Technical back section with tight direction changes.'
        ),
        'notableFeatures': [
            'Counter-clockwise direction',
            '7 left-hand corners, 4 right-hand corners',
            'Two hairpins (T4 left, T8 right)',
            'Fast kinks at T1 and T5',
            'Sweeping left at T7',
            'Long right hairpin at T8',
            'Final hairpin left onto pit straight'
        ],
        'corners': RUAPUNA_CORNERS,
        'researchConfidence': 'high',
        'sourceNotes': 'Verified driver data — not AI-generated',
        'prebuilt': True,
    }


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
