axes:
  e:
    inverted: false
    speed: 300
  x:
    inverted: false
    speed: 6000
  y:
    inverted: false
    speed: 6000
  z:
    inverted: false
    speed: 200
color: default
extruder:
  count: 2
  nozzleDiameter: 0.4
  offsets:
  - - 0.0
    - 0.0
  - - 0.0
    - 0.0
heatedBed: true
id: bolt
model: Bolt
name: Bolt
volume:
  custom_box: false
  depth: 320.0
  formFactor: rectangular
  height: 205.0
  origin: lowerleft
  width: 330.0
boundaries:
  minX: 0
  maxX: 373
  minY: -35
  maxY: 320
  minZ: -1.0
  maxZ: 205
requireOverscroll: false
hasPowerButton: true
filamentRollLength: 320
default_stepper_timeout: 60
autoBedCalibration: false
extruderCalibration: true
modelSizeDetection: true
doorSafety: false
filamentDetection: false
filamentQuickLoad: false
dualX: true
materialMinTemp: 150
materialMaxTemp: 360
filament:
  stepper_timeout: 300
  load_initial:
    amount: 2.5
    speed: 240
  load_amount_stop: 200
  cont_load_amount_stop: 100    
  unload_initial:
    amount: -2.5
    speed: 300
  unload_amount_stop: 150
manualBedCalibrationPositions:
  - tool: tool1
    X: 70
    Y: 250
    mode: 'fullcontrol'
  - tool: tool0
    X: 305
    Y: 250
    mode: 'fullcontrol'
  - tool: tool1
    X: 70
    Y: 70
    mode: 'fullcontrol'
  - tool: tool0
    X: 305
    Y: 70
    mode: 'fullcontrol'
  - tool: tool1
    X: 175
    Y: 160
    mode: 'mirror'
