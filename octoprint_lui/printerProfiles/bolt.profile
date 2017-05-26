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
  nozzleDiameter: 0.35
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
  minX: -37.0
  maxX: 330.0
  minY: -33.0
  maxY: 322.0
  minZ: -1.0
  maxZ: 205.0
requireOverscroll: false
hasPowerButton: true
filamentRollLength: 320
defaultStepperTimeout: 60
autoBedCalibration: false
extruderCalibration: true
modelSizeDetection: true
doorSafety: false
filamentDetection: false
filamentQuickLoad: false
dualX: true
materialMinTemp: 150
materialMaxTemp: 360
lowTempMax: 275
filament:
  stepperTimeout: 300
  loadInitial:
    amount: 2.5
    speed: 240
  loadAmountStop: 200
  contLoad:
    amount: 2.5
    speed: 240
  contLoadAmountStop: 100
  unloadInitial:
    amount: -2.5
    speed: 300
  unloadAmountStop: 150
manualBedCalibrationPositions:
  top_left:
    tool: tool1
    X: 33
    Y: 250
    mode: 'fullcontrol'
  top_right:
    tool: tool0
    X: 268
    Y: 250
    mode: 'fullcontrol'
  bottom_left:
    tool: tool1
    X: 33
    Y: 70
    mode: 'fullcontrol'
  bottom_right:
    tool: tool0
    X: 268
    Y: 70
    mode: 'fullcontrol'
