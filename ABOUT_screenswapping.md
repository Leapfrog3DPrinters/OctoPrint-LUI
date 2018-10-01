#
This file documents how to fix wrong screen settings
#

- If the WaveShare screen is connected but upside down and/or wrong resolution, unplug the connecting USB cable and plug it back in while printer is turned ON
- If the Atmel screen is connected but upside down and/or wrong resolution, unplug the connecting USB cable and plug it back in while printer is turned ON
- If the FT5406 screen is connected but upside down and/or wrong, press CTRL+ALT+F1 and log in. Navigate to home/pi/scripts and run ./runScreenResize

after any of this actions the system will reboot itself twice while changing the screen settings
