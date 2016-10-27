## Change log 

This is where we keep a short list of changes just to remember stuff. And things. 

### 1.0.1

- Better Xcel support
- Better filament detection handling for Xeed and Xcel, including only filament detection during printing.
- Better out of bounds grid and info. (Check dimensions)
- Fixed blocking flyout bug introduced in 1.0.0
- Fixed out of bounds check bug
- Added full gcode name to additional information
- Additional information of job can always be shown now, if analysis is not done yet this will be shown with a spinner.
- No more auto *.HEX detection, only in debug mode.
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
- Debug moved to config.yaml setting(debug_lui: true/false)
- Minimizing back-end calls 


## Known bugs

- Still got an issue with first boot and not being able to home. 'Retry printer connection' needed
- Printer locks down if nozzle is swapped when printer is on. Needs a wizard / work.


