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
  depth: 245.0
  formFactor: rectangular
  height: 2000.0
  origin: lowerleft
  width: 350.0
filament:
  load_initial:
    amount: 18
    speed: 2000
  load_change:
    start: 1900
    amount: 2.5
    speed: 300
  load_amount_stop: 2100
  unload_initial:
    amount: -2.5
    speed: 300
  unload_change:
    start: 30
    amount: -18
    speed: 2000
  unload_amount_stop: 2100
