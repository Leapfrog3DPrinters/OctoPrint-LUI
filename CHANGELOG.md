## Change log 

This is where we keep a short list of changes just to remember stuff. And things. 

### 1.0.3 

- Added notifications on disk space low and diskspace critically low.
- After print done/cancel/error print, move the bed down 20mm. 
- After z-offset (Xcel / Xeed) is completed, move the bed down 20mm.
- Fixed: Webcam stream not working in certain situations. 
- Fixed: Bug not being to start a print in certain situations introduced in 1.0.2
- Fixed: Can't login remotoly on Safari browser
- Fixed: Actual and Target temperature could take two lines when certain temperatures were shown



### 1.0.2

- Changed 'Check Dimension' option that failed on the new wiping sequence coordinates. The dimension check is less strict now and depends more on the user input knowledge
- Selecting sync/mirror mode will show a warning that the model has to be sliced on the left side with one nozzle



### 1.0.1

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




### 1.0.0 

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


