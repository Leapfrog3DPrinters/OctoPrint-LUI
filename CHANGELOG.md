# Change log 

Change log for OctoPrint-LUI. 

## 1.1.0

- Startup time improved by bundling javascript and CSS files
- Updated all javascript libraries to the most recent versions

### Bug fix release of 1.0.6

- Added text in the maintenance warning to clarify that the maintenance position will turn off the power of the print electronics temporarily. 
- Fixed OctoPrint-flashArduino not updating correctly. Added new setup.py and bumped version to 1.0.2
- Fixed Thermistor errors that could be resolved without a thermistor plugged in. 

### 1.0.6 additions:

- Added UI translations. Dutch and German are now available. Settings -> Languages.
- Added ability to restore printer after temperature errors
- When pressing the shutdown button during printing, a request is made to enable auto-shutdown
- Added the ability to automatically update the printer firmware over internet.
- 'Head maintenance' now shutsdown the printer temporarily to improve safety when swapping nozzles.
- Updated OctoPrint branch to 1.3.1(master) with cherry-pick commit from maintenance to enable UI translations. 
- OctoPrint-flashArduino(lui-branch) updated to allow flashing through the internet. Version to 1.0.1.

## 1.0.6


- Added UI translations. Dutch and German are now available. Settings -> Languages.
- Added ability to restore printer after temperature errors
- When pressing the shutdown button during printing, a request is made to enable auto-shutdown
- Added the ability to automatically update the printer firmware over internet.
- 'Head maintenance' now shutsdown the printer temporarily to improve safety when swapping nozzles.
- Updated OctoPrint branch to 1.3.1(master) with cherry-pick commit from maintenance to enable UI translations. 
- OctoPrint-flashArduino(lui-branch) updated to allow flashing through the internet. Version to 1.0.1.

## 1.0.5

### This update requires two _consecutive_ updates due to switching of branches. Update version number will stay 1.0.5. after second update.

- Switched main update branch from `devel` to `master`. ***Requires 2 consecutive updates**
- Added changelog information screen after update. Can be accessed through the Settings -> Update -> Changelog button.
- Added option to download log files or to copy log files to a usb. Settings -> Logs.
- Blocked being able to upload STL files from remote PC. If by any method an STL file is uploaded anyways, added an option to delete STL file in the file browser. 
- Added auto shutdown function. Will shutdown the machine after print is finished. Option will reset after a shutdown. Go to Settings -> Printer to turn it on/off.
- Auto-shut down adds a "!" behind the power icon in the UI. It also adds a warning to the shutdown option.
- Enhanced the selection of materials during filament swap. Bigger area to tap on.
- Added warning when printer is in Error state on start up. 
- Printer can be shut down when in Error state on start up.
- Added error explanation if error is MINTEMP during startup: Either extruder disconnected or very cold environment.
- User is prevented from uploading other files than .gcode/.gco/.g
- Fixed: Shifting after resuming a paused print.
- Fixed: Extruder calibration now shows y-axis alignment in correct order.
- Fixed: Powerbutton now works before printer has homed.
- Fixed: Printer is unresponsive after start up and needs to retry connection.  
- Fixed: Can't swap filament after a print is finished.
- Fixed: Bug in OctoPrint-NetworkManager where SSIDs with ":" would crash the SSID parser. Bumped version of NetworkManager to 1.0.1
- Fixed: G92 X0 Y0 Z0 were not stripped correctly. G92 X0 Y0 Z0, which will zero a specific axis, will bug the printer when in sync/mirror mode and are therefore removed from gcode when sending. 

## 1.0.4

- Fixed: Bug introduced in 1.0.3 that would not allow remote uploads. 

## 1.0.3 

- Added notifications on disk space low and diskspace critically low.
- After print done/cancel/error print, move the bed down 20mm. 
- After z-offset (Xcel / Xeed) is completed, move the bed down 20mm.
- Fixed: Webcam stream not working in certain situations. 
- Fixed: Bug not being to start a print in certain situations introduced in 1.0.2. (typo)
- Fixed: Can't login remotely on Safari browser(css rule fix)
- Fixed: Actual and Target temperature could take two lines when certain temperatures were shown


## 1.0.2

- Changed 'Check Dimension' option that failed on the new wiping sequence coordinates. The dimension check is less strict now and depends more on the user input knowledge
- Selecting sync/mirror mode will show a warning that the model has to be sliced on the left side with one nozzle


## 1.0.1

- Better Xcel support
- Better filament detection handling for Xeed and Xcel, including only filament detection during printing.
- Better out of bounds grid and info. (Check dimensions)
- Fixed blocking flyout bug introduced in 1.0.0
- Fixed out of bounds check bug
- Added full gcode name to additional information
- Additional information of job can always be shown now, if analysis is not done yet this will be shown with a spinner.
- No more auto *.HEX detection, only in debug mode
- Typo's
- Title change: Timelapse -> Webcam in settings menu 
- Added this changelog ^^


## 1.0.0 

- All modules to 1.0.0 
- Added global version number to settings screen
- gcodeRender to master branch
- Added better multiple flyout support
- Tweaked bed level calibration
- on{$SettingsTopic}SettingsShown callback added to minimize calls to back-end 
- Refactored updating mechanism completely
- Warning if no internet connection is available or if update server(github) is not available
- Debug moved to config.yaml setting(debug_lui: true/false)
- Minimizing back-end calls 


## Known bugs

- Still got an issue with first boot and not being able to home. 'Retry printer connection' needed
- Printer locks down if nozzle is swapped when printer is on. Needs a wizard / work.


