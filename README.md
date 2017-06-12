# OctoPrint-LUI

Leapfrog User Interface
----

This plugin is geared towards usage on machines of Leapfrog 3D Printers. 

----

Enables a mobile first responsive UI, build on modern browser capabilities of Flexbox. 

## Setup

This UI plugin needs several other plugins to function:

OctoPrint-NetworkManager
OctoPrint-flashArduino
OctoPrint-gcodeRender

Install via this URL:

    https://github.com/Leapfrog3DPrinters/OctoPrint-LUI/archive/master.zip

After downloading, activate the OctoPrint virtual environment and install the plugin using

~~~~python setup.py install~~~~

## Gcode scripts
On the first startup after every update, LUI copies all machine related gcode scripts (from the gcodes/scripts folder) to the OctoPrint scripts folder (usually ~/.octoprint/scripts). The Bolt/BoltPro wiping and extruder calibration scripts can be generated using gcodes/bolt_scripts_generator.py.