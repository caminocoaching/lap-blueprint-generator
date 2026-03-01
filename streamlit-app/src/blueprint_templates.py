"""
Blueprint Templates — Vehicle-specific QE protocol templates for the Lap Blueprint Generator.
Provides standardized templates for motorcycle, car, kart, and formula racing vehicles.
"""

TEMPLATES = {
    'motorcycle': {
        'vehicleType': 'motorcycle',
        'name': 'Motorcycle Racing',
        'version': '1.0',
        'gazePhases': {
            'brakeMarkerVisible': {
                'minFixationSec': 0.3,
                'maxFixationSec': 0.8,
                'headLeadTimeSec': 0.9,
                'peripheralType': 'wide_angle',
                'eyesHint': 'Focus on brake marker board or reference point ahead',
                'awareHint': 'Body lean angle, throttle hand position, tank pressure'
            },
            'brake': {
                'minFixationSec': 0.4,
                'maxFixationSec': 1.0,
                'headLeadTimeSec': 0.9,
                'peripheralType': 'wide_angle',
                'eyesHint': 'Track to apex line, brake smoothness feedback',
                'awareHint': 'Lean initiation, handlebar pressure, visor references'
            },
            'apex': {
                'minFixationSec': 0.2,
                'maxFixationSec': 0.6,
                'headLeadTimeSec': 0.8,
                'peripheralType': 'wide_angle',
                'eyesHint': 'Apex cone, inside kerb paint, trajectory line',
                'awareHint': 'Maximum lean angle, knee position on tank, throttle roll-on'
            },
            'exit': {
                'minFixationSec': 0.3,
                'maxFixationSec': 0.8,
                'headLeadTimeSec': 0.9,
                'peripheralType': 'wide_angle',
                'eyesHint': 'Exit kerb end, track opening, throttle response',
                'awareHint': 'Lean reduction rate, throttle hand progression, vestibular cues'
            },
            'nextMarker': {
                'minFixationSec': 0.3,
                'maxFixationSec': 0.9,
                'headLeadTimeSec': 1.0,
                'peripheralType': 'wide_angle',
                'eyesHint': 'Next brake board, corner entry point, straight-line references',
                'awareHint': 'Throttle stability, body position centering, visor angle'
            }
        },
        'validationRules': {
            'eyesMinLength': 10,
            'awareMinLength': 10,
            'awareKeywords': [
                'lean', 'tank', 'handlebar', 'knee', 'vestibular',
                'throttle hand', 'visor', 'shoulder', 'hip', 'brake pressure',
                'trail braking', 'weight transfer', 'counter-steer'
            ],
            'quietEyeCueVerbs': [
                'focus on', 'track', 'watch', 'see', 'look at',
                'follow', 'scan', 'reference', 'pick', 'nail'
            ]
        },
        'speedRampDefaults': {
            'sweeper': 75,
            'medium': 60,
            'tight': 40,
            'hairpin': 25,
            'chicane': 45,
            'esses': 50,
            'fast': 85
        },
        'systemPromptSection': '''You are a motorcycle racing Quiet Eye coach. Focus on:
- Head lead timing: Eyes should be 0.8-1.0 seconds ahead of the motorcycle
- Body awareness: Lean angle, tank pressure, knee position, handlebar grip
- Throttle hand sensitivity: Progressive roll-on through corner exit
- Vestibular balance cues: Inner ear feedback during lean transitions
- Visor positioning and visual reference points for line accuracy
- Trail braking technique integration with body positioning
Generate motorcycle-specific gaze and awareness cues that emphasize the unique demands of motorcycle dynamics.'''
    },

    'car': {
        'vehicleType': 'car',
        'name': 'Car Racing',
        'version': '1.0',
        'gazePhases': {
            'brakeMarkerVisible': {
                'minFixationSec': 0.3,
                'maxFixationSec': 0.7,
                'headLeadTimeSec': 0.65,
                'peripheralType': 'wide_frontal',
                'eyesHint': 'Brake board or apex entry reference ahead',
                'awareHint': 'Steering wheel angle, throttle position, brake pressure'
            },
            'brake': {
                'minFixationSec': 0.4,
                'maxFixationSec': 0.9,
                'headLeadTimeSec': 0.65,
                'peripheralType': 'wide_frontal',
                'eyesHint': 'Apex target line, A-pillar blind spot check',
                'awareHint': 'Brake pedal feedback, steering input rate, weight balance'
            },
            'apex': {
                'minFixationSec': 0.2,
                'maxFixationSec': 0.5,
                'headLeadTimeSec': 0.55,
                'peripheralType': 'wide_frontal',
                'eyesHint': 'Apex cone or inside kerb paint, trajectory confirmation',
                'awareHint': 'Steering wheel position, throttle application start, G-forces'
            },
            'exit': {
                'minFixationSec': 0.3,
                'maxFixationSec': 0.7,
                'headLeadTimeSec': 0.60,
                'peripheralType': 'wide_frontal',
                'eyesHint': 'Exit kerb end, track opening direction, next sector entry',
                'awareHint': 'Throttle pedal progression, steering release timing, grip feedback'
            },
            'nextMarker': {
                'minFixationSec': 0.3,
                'maxFixationSec': 0.8,
                'headLeadTimeSec': 0.75,
                'peripheralType': 'wide_frontal',
                'eyesHint': 'Next corner entry point, braking marker board, straight-line focus',
                'awareHint': 'Throttle stability, steering wheel centering, pedal coordination'
            }
        },
        'validationRules': {
            'eyesMinLength': 10,
            'awareMinLength': 10,
            'awareKeywords': [
                'steering', 'throttle', 'brake', 'wheel', 'pedal',
                'grip', 'foot', 'A-pillar', 'weight', 'G-force',
                'brake balance', 'throttle application', 'downforce'
            ],
            'quietEyeCueVerbs': [
                'focus on', 'track', 'watch', 'see', 'look at',
                'follow', 'scan', 'reference', 'pick', 'nail'
            ]
        },
        'speedRampDefaults': {
            'sweeper': 70,
            'medium': 55,
            'tight': 35,
            'hairpin': 20,
            'chicane': 40,
            'esses': 50,
            'fast': 80
        },
        'systemPromptSection': '''You are a car racing Quiet Eye coach. Focus on:
- Head lead timing: Eyes should be 0.55-0.75 seconds ahead of the vehicle
- Steering wheel position and input rate through corner transitions
- Brake and throttle pedal coordination and feedback
- A-pillar blind spot awareness and mitigation
- Weight transfer and G-force feedback through the seat and steering
- Grip threshold management and margin control
Generate car-specific gaze and awareness cues emphasizing steering precision, pedal control, and vehicle balance feedback.'''
    },

    'kart': {
        'vehicleType': 'kart',
        'name': 'Kart Racing',
        'version': '1.0',
        'gazePhases': {
            'brakeMarkerVisible': {
                'minFixationSec': 0.2,
                'maxFixationSec': 0.6,
                'headLeadTimeSec': 0.6,
                'peripheralType': 'ultra_wide',
                'eyesHint': 'Brake marker or entry reference point ahead',
                'awareHint': 'Steering bar position, throttle foot pressure, seat feedback'
            },
            'brake': {
                'minFixationSec': 0.3,
                'maxFixationSec': 0.7,
                'headLeadTimeSec': 0.6,
                'peripheralType': 'ultra_wide',
                'eyesHint': 'Direct line to apex, brake smoothness feedback',
                'awareHint': 'Throttle/brake foot transition, direct steering feel, wind speed'
            },
            'apex': {
                'minFixationSec': 0.15,
                'maxFixationSec': 0.4,
                'headLeadTimeSec': 0.5,
                'peripheralType': 'ultra_wide',
                'eyesHint': 'Apex cone, inside kerb, tight trajectory line',
                'awareHint': 'Direct steering input feedback, throttle bite, acceleration point'
            },
            'exit': {
                'minFixationSec': 0.2,
                'maxFixationSec': 0.6,
                'headLeadTimeSec': 0.55,
                'peripheralType': 'ultra_wide',
                'eyesHint': 'Exit kerb, track opening, throttle response point',
                'awareHint': 'Steering straightening rate, throttle application, kart balance'
            },
            'nextMarker': {
                'minFixationSec': 0.25,
                'maxFixationSec': 0.7,
                'headLeadTimeSec': 0.7,
                'peripheralType': 'ultra_wide',
                'eyesHint': 'Next corner entry, straight-line apex, brake reference',
                'awareHint': 'Throttle control on straight, steering bar centering, wind feel'
            }
        },
        'validationRules': {
            'eyesMinLength': 10,
            'awareMinLength': 10,
            'awareKeywords': [
                'steering bar', 'throttle foot', 'brake foot', 'direct steering',
                'wind speed', 'seat feedback', 'kart balance', 'brake pressure',
                '200 degree visual', 'throttle bite', 'acceleration point'
            ],
            'quietEyeCueVerbs': [
                'focus on', 'track', 'watch', 'see', 'look at',
                'follow', 'scan', 'reference', 'pick', 'nail'
            ]
        },
        'speedRampDefaults': {
            'sweeper': 65,
            'medium': 50,
            'tight': 30,
            'hairpin': 15,
            'chicane': 35,
            'esses': 45,
            'fast': 75
        },
        'systemPromptSection': '''You are a kart racing Quiet Eye coach. Focus on:
- Head lead timing: Eyes should be 0.5-0.7 seconds ahead of the kart
- Direct steering feel and immediate feedback through the steering bar
- Foot coordination between throttle and brake pedals with rapid transitions
- Ultra-wide visual field awareness (200°+ typical kart sight lines)
- Wind speed sensitivity and track surface feedback through the seat
- Acceleration point precision and throttle bite management
Generate kart-specific gaze and awareness cues emphasizing direct mechanical feedback, foot pedal coordination, and wide-angle visual scanning.'''
    },

    'formula': {
        'vehicleType': 'formula',
        'name': 'Formula Racing',
        'version': '1.0',
        'gazePhases': {
            'brakeMarkerVisible': {
                'minFixationSec': 0.3,
                'maxFixationSec': 0.7,
                'headLeadTimeSec': 0.65,
                'peripheralType': 'restricted_halo',
                'eyesHint': 'Brake board or apex entry through halo device frame',
                'awareHint': 'Steering wheel angle, brake pressure, G-force harness feedback'
            },
            'brake': {
                'minFixationSec': 0.4,
                'maxFixationSec': 0.8,
                'headLeadTimeSec': 0.65,
                'peripheralType': 'restricted_halo',
                'eyesHint': 'Apex line, small mirror check for car position, trajectory',
                'awareHint': 'Brake pedal feedback, steering input rate, extreme G-forces'
            },
            'apex': {
                'minFixationSec': 0.2,
                'maxFixationSec': 0.5,
                'headLeadTimeSec': 0.55,
                'peripheralType': 'restricted_halo',
                'eyesHint': 'Apex cone or kerb paint, steering display data integration',
                'awareHint': 'Throttle application, G-force on harness and neck, steering wheel position'
            },
            'exit': {
                'minFixationSec': 0.3,
                'maxFixationSec': 0.7,
                'headLeadTimeSec': 0.60,
                'peripheralType': 'restricted_halo',
                'eyesHint': 'Exit kerb, steering display feedback, track opening direction',
                'awareHint': 'Throttle pedal progression, steering release rate, lateral G-forces'
            },
            'nextMarker': {
                'minFixationSec': 0.3,
                'maxFixationSec': 0.8,
                'headLeadTimeSec': 0.75,
                'peripheralType': 'restricted_halo',
                'eyesHint': 'Next corner entry through halo, braking reference, DRS zone check',
                'awareHint': 'Throttle stability, pedal coordination, harness pressure, steering wheel data'
            }
        },
        'validationRules': {
            'eyesMinLength': 10,
            'awareMinLength': 10,
            'awareKeywords': [
                'halo device', 'small mirrors', 'G-force', 'harness',
                'steering display', 'brake pressure', 'throttle application',
                'neck feedback', 'DRS zone', 'pit limiter', 'steering wheel',
                'extreme forces', 'lateral acceleration', 'brake balance'
            ],
            'quietEyeCueVerbs': [
                'focus on', 'track', 'watch', 'see', 'look at',
                'follow', 'scan', 'reference', 'pick', 'nail'
            ]
        },
        'speedRampDefaults': {
            'sweeper': 80,
            'medium': 65,
            'tight': 45,
            'hairpin': 30,
            'chicane': 50,
            'esses': 60,
            'fast': 90
        },
        'systemPromptSection': '''You are a formula racing Quiet Eye coach. Focus on:
- Head lead timing: Eyes should be 0.55-0.75 seconds ahead of the vehicle
- Halo device frame awareness and restricted visual field management
- Small mirror utilization for spatial positioning and traffic awareness
- Extreme G-force feedback through the harness and neck feedback
- Steering display integration and telemetry data awareness
- High-precision brake and throttle pedal control under extreme forces
- DRS zone management and pit limiter interaction
Generate formula-specific gaze and awareness cues emphasizing precision under extreme physical forces, restricted visibility compensation, and advanced vehicle control systems.'''
    }
}


def get_template(vehicle_type):
    """Retrieve a template by vehicle type."""
    vehicle_type = vehicle_type.lower().strip()
    if vehicle_type not in TEMPLATES:
        raise ValueError(f"Unknown vehicle type: {vehicle_type}. Available: {list(TEMPLATES.keys())}")
    return TEMPLATES[vehicle_type]


def get_available_templates():
    """Return list of available vehicle types."""
    return list(TEMPLATES.keys())


def validate_template_structure(template):
    """Validate that a template has all required fields."""
    required_keys = ['vehicleType', 'name', 'version', 'gazePhases', 'validationRules', 'speedRampDefaults', 'systemPromptSection']
    for key in required_keys:
        if key not in template:
            raise ValueError(f"Template missing required key: {key}")

    required_gaze_phases = ['brakeMarkerVisible', 'brake', 'apex', 'exit', 'nextMarker']
    for phase in required_gaze_phases:
        if phase not in template['gazePhases']:
            raise ValueError(f"Template missing gaze phase: {phase}")

        phase_data = template['gazePhases'][phase]
        phase_keys = ['minFixationSec', 'maxFixationSec', 'headLeadTimeSec', 'peripheralType', 'eyesHint', 'awareHint']
        for pk in phase_keys:
            if pk not in phase_data:
                raise ValueError(f"Gaze phase '{phase}' missing: {pk}")

    validation_keys = ['eyesMinLength', 'awareMinLength', 'awareKeywords', 'quietEyeCueVerbs']
    for key in validation_keys:
        if key not in template['validationRules']:
            raise ValueError(f"Validation rules missing: {key}")

    return True
