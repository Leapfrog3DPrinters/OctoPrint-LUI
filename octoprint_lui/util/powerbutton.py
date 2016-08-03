try:
    import RPi.GPIO as GPIO
except RuntimeError:
    print "Error importing RPi.GPIO!  This is probably because you need superuser privileges.  You can achieve this by using 'sudo' to run your script"

LED_PIN = 22 
PWR_PIN = 11 # Toggles power supply
BUTTON_PIN = 16

BOUNCETIME = 1000 # minimal press interval in ms

class PowerButtonHandler:
    def __init__(self, callback):
        self._printer = printer
        GPIO.setmode(GPIO.BOARD)
        GPIO.setup(PWR_PIN, GPIO.OUT, initial=GPIO.HIGH)
        GPIO.setup(LED_PIN, GPIO.OUT, initial=GPIO.HIGH)
        GPIO.setup(BUTTON_PIN, GPIO.IN)

        GPIO.add_event_detect(BUTTON_PIN, GPIO.RISING, callback=callback, bouncetime=BOUNCETIME)
