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
dualX: true
materialMinTemp: 150
materialMaxTemp: 275
filament:
  load_initial:
    amount: 18
    speed: 2000
  load_change:
    start: 1900
    amount: 2.5
    speed: 300
  load_amount_stop: 2100
  cont_load_amount_stop: 100
  unload_initial:
    amount: -2.5
    speed: 300
  unload_change:
    start: 30
    amount: -18
    speed: 2000
  unload_amount_stop: 2100
