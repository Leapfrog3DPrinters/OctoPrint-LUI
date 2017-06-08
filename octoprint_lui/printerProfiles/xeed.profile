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
id: xeed
model: Xeed
name: Xeed
volume:
  custom_box: false
  depth: 220.0
  formFactor: rectangular
  height: 230.0
  origin: lowerleft
  width: 280.0
boundaries:
  minX: 0
  maxX: 280
  minY: 0
  maxY: 220
  minZ: 0
  maxZ: 230
requireOverscroll: true
filamentRollLength: 320
autoBedCalibration: true
extruderCalibration: false
modelSizeDetection: false
doorSafety: true
filamentDetection: true
filamentQuickLoad: true
dualX: false
materialMinTemp: 150
materialMaxTemp: 275
lowTempMax: 275
rgbLights: false
filament:
  loadInitial:
    amount: 18
    speed: 2000
  loadChange:
    start: 1900
    amount: 2.5
    speed: 300
  loadAmountStop: 2100
  contLoad:
    amount: 2.5
    speed: 300
  contLoadAmountStop: 100
  unloadInitial:
    amount: -2.5
    speed: 300
  unloadChange:
    start: 30
    amount: -18
    speed: 2000
  unloadAmountStop: 2100
