#
This file documents how to fix wrong screen settings
#

- If the WaveShare screen is connected but upside down and/or wrong resolution, unplug the connecting USB cable and plug it back in while printer is turned ON
- If the Atmel screen is connected but upside down and/or wrong resolution, unplug the connecting USB cable and plug it back in while printer is turned ON
- If the FT5406 screen is connected but upside down and/or wrong resolution, press CTRL+ALT+F1 and log in. Navigate to home/pi/scripts and run ./runScreenResize

after any of these actions the system will reboot itself twice while changing the screen settings

If the aformentioned actions do not have the desired result: 
1. Check if system has the newest software, if not: update and try again
otherwise:
2. Log into the raspberry command line
3. move to the /home/pi/.config folder
4. here should be a file .*screenName*Installed (for example: .AtmelInstalled), remove it, reboot and run the screenupdater again
