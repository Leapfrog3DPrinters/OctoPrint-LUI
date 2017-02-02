from __future__ import print_function
import subprocess

try:
    import RPi.GPIO as GPIO
except RuntimeError:
    print("Error importing RPi.GPIO!  This is probably because you need superuser privileges.  You can achieve this by using 'sudo' to run your script")
except ImportError:
    print("Could not find RPi.GPIO. Running on another machine?")

LED_PIN = 22 
PWR_PIN = 11 # Toggles power supply
BUTTON_PIN = 16

BOUNCETIME = 1000 # minimal press interval in ms

class PowerButtonHandler:
    def __init__(self, callback):
        self.callback = callback

        GPIO.setwarnings(False)
        
        # Set pins
        GPIO.setmode(GPIO.BOARD)
        GPIO.setup(PWR_PIN, GPIO.OUT, initial=GPIO.HIGH)
        GPIO.setup(LED_PIN, GPIO.OUT, initial=GPIO.HIGH)
        GPIO.setup(BUTTON_PIN, GPIO.IN, pull_up_down = GPIO.PUD_DOWN)

        # Listen for button events on seperate thread
        GPIO.add_event_detect(BUTTON_PIN, GPIO.RISING, callback=self.onPress)

        # Close intermediate button 'service'
        subprocess.call("sudo service aasoftpoweroff stop".split())

    def onPress(self, channel):
        #TODO: Maybe do some more advanced stuff, like seperate callbacks for different press duration
        if callable(self.callback):
            self.callback()

    def disableAuxPower(self):
        GPIO.output(PWR_PIN, GPIO.LOW)

    def enableAuxPower(self):
        GPIO.output(PWR_PIN, GPIO.HIGH)

class DummyPowerButtonHandler:
    def __init__(self, callback):
        pass
    def onPress(self, channel):
        pass
    def disableAuxPower(self):
        pass
    def enableAuxPower(self):
        pass
