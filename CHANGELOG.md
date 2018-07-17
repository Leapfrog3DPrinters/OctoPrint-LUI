# Changelog

Changelog for OctoPrint-LUI.

## 1.3.2
-  Nothing just checking

## 1.3.1 

-  Fixed problem which stopped some users from being able too update.


## 1.3.0

- Fixed bed calibration sequence   

## 1.2.9

-  Changed update mechanism to ensure better installation of software updates in the future
  

## 1.2.8

- fixed the screen layout for new screen setup and better USB detection

## 1.2.7

- fixed calibration procedure for bolt and made abort of calibration procedure work as expected

## 1.2.6

- fixed failed upload of version 1.2.5

## 1.2.5

- Improved the calibration sequence for the bed
- Added support for spanish

## 1.2.4

- changed device settings to prevent USB stick corruptions.

## 1.2.3

- Fixed problem with unaccessible USB flash drives
- Made some menu items and message more user-friendly
- Added support for Xcel printers
- General code cleanup

## 1.2.2

- Fixed: Wiping sequence for Bolt Pro models
- Fixed: issue with empty files from USB stick transwer on the machine
- Added: Automatic mouse detection, user interface able to use with mouse on the printer
- Added: Support for future changes to new screens

## 1.2.1

- Fixed: wiping sequence after filament swap

## 1.2.0

- New: Ability to configure static IP addresses
- New: Copy all G-codes and timelapses to a USB drive
- New: Introductory tutorial for creating your first 3D print
- Improved: Longer timelapse post roll
- Improved: Current print status
- Improved: G-code previews are now rendered faster
- Improved: "Head maintenance" allows to pre-heat
- Improved: Video scaling of livestream
- Improved: Many bug fixes and performance improvements

## 1.1.1

- Improved: Feedback when copying file to USB
- Improved: German translations
- Improved: course and fine extruder calibration do not overlap anymore
- Fixed: fine extruder calibration does not generate any overlapping lines
- Fixed: compatibility with Leapfrog Xcel

## 1.1.0

### This update requires new slicing profiles. Go to bolt.lpfrg.com for the new Simplify3D slicing profiles or update your Creatr Software settings by pressing the Update profiles button in the Profile editor.

- Added ability to swap filament when the print is paused
- Improved user experience when pausing or cancelling print
- When updating software, firmware is automatically updated when necessary
- Coordinate system is updated to match actual print area better(requires new slicing profiles)
- Improved livestream performance. Older browsers are no longer supported
- Timelapses are now ordered by date
- Log files may be downloaded when the printer is unresponsive
- Startup time improved by bundling javascript and CSS files
- Updated all javascript libraries to the most recent versions
- Fixed: auto shutdown is no longer initiated after calibration

## 1.0.8
- Improved update procedure to reduce chance of corrupted installations
- Temporarily disabled model size detection

## 1.0.7

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


