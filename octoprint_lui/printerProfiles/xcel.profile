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
  count: 1
  nozzleDiameter: 2.2
  offsets:
  - - 0.0
    - 0.0
  - - 0.0
    - 0.0
heatedBed: true
id: xcel
model: Xcel
name: Xcel
volume:
  custom_box: false
  depth: 500
  formFactor: rectangular
  height: 2240
  origin: lowerleft
  width: 550
boundaries:
  minX: 0
  maxX: 550
  minY: 0
  maxY: 500
  minZ: 0
  maxZ: 2240
requireOverscroll: false
filamentRollLength: 8000
autoBedCalibration: true
extruderCalibration: false
modelSizeDetection: true
doorSafety: false
filamentDetection: true
filamentQuickLoad: false
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
    start: 2400
    amount: 2.5
    speed: 300
  loadAmountStop: 2800
  contLoad:
    amount: 2.5
    speed: 300
  contLoadAmountStop: 400
  unloadInitial:
    amount: -2.5
    speed: 300
  unloadChange:
    start: 30
    amount: -18
    speed: 2000
  unloadAmountStop: 2600
