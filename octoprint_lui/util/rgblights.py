from __future__ import division
import ctypes as ct
import spidev
import time
import threading, Queue
import math
from binascii import unhexlify

class RgbPatternManager(object):
    def __init__(self, settings):
        self._settings = settings
        self._handler = RgbLightsHandler()
        self._handler.start()

    def on_startup(self):
        color = self._settings.get(["rgb_lights_default_color"])
        self._handler.set_pulsing_color(color)

    def preview(self, color):
        self._handler.set_color(color)

    def on_idle(self):
        color = self._settings.get(["rgb_lights_default_color"])
        self._handler.set_color(color)

    def on_heating(self):
        color = self._settings.get(["rgb_lights_heating_color"])
        self._handler.set_fast_pulsing_color(color)

    def on_printing(self):
        color = self._settings.get(["rgb_lights_printing_color"])
        self._handler.set_color(color)

class RgbDriver(object):
    resolution = 4095
    def __init__(self):
        self.spi = spidev.SpiDev()
        self.spi.open(0, 0)
        self.spi.mode=0
        #self.spi.no_cs = True
        #self.spi.cshigh = True
        self.spi.max_speed_hz = 30000

    def set_rgbw(self,r,g,b,w=0.0):
        pwm_r = int(r * RgbDriver.resolution)
        pwm_g = int(g * RgbDriver.resolution)
        pwm_b = int(b * RgbDriver.resolution)
        pwm_w = int(w * RgbDriver.resolution)
        values= [pwm_r, pwm_g, pwm_b, pwm_w, pwm_r, pwm_g, pwm_b, pwm_w]
        s = ''.join('{:03x}'.format(v) for v in reversed(values))
        to_send = unhexlify(s)
        self.spi.writebytes(list(bytearray(to_send)))

    def __del__(self):
        self.spi.close()
        
class RgbLightsHandler(object):
    def __init__(self):
        self._driver = None
        self._worker_thread = None
        self._worker_lock =  threading.RLock()
        self._stop_worker = False
        self._pattern = None
        self.running = False
        self._color = (0, 0, 1.0, 0.0)
        self._interval = 0.5
        
    def set_color(self, hex_color):
        """
        Sets the color of the RGB leds based on a 3-byte hex string
        """
        color = self._parse_hex(hex_color)

        # Send the color to the driver
        self._set_constant_color_immediate(color)

    def set_pulsing_color(self, hex_color):
        """
        Sets the color of the RGB leds based on a 3-byte hex string
        """
        color = self._parse_hex(hex_color)

        # Send the color to the driver
        self._set_pulsing(color)
        
    def set_fast_pulsing_color(self, hex_color):
        """
        Sets the color of the RGB leds based on a 3-byte hex string
        """
        color = self._parse_hex(hex_color)

        # Send the color to the driver
        self._set_pulsing(color, 2)
        
    def start(self):
        if not self.running:
            self._worker_thread = threading.Thread(target=self._worker)
            self._worker_thread.setDaemon(True)
            self._worker_thread.start()
            self.running = True

    def stop(self):
        if self._worker_thread and not self.running:
            self._stop_worker = True
            
    def _worker(self):
        self._driver = RgbDriver()
        while True:
            with self._worker_lock:
                if self._stop_worker:
                    del self._driver
                    self.running = False
                    break

                if self._pattern:
                    self._color = self._pattern.get_color()
                    self._interval = self._pattern.refresh_interval

            self._driver.set_rgbw(*self._color);
            time.sleep(self._interval)

    def _set_constant_color(self, color):
        if not color:
            return
        with self._worker_lock:
            self._pattern = RgbLightConstant(color)

    def _set_constant_color_immediate(self, color):
        if not color:
            return
        with self._worker_lock:
            self._pattern = RgbLightConstantImmediate(color)

    def _set_pulsing(self, color, speed = 0.5):
        if not color:
            return
        with self._worker_lock:
            self._pattern = RgbLightPulsing(color, speed)

    def _parse_hex(self, hex_color):
        # Remove any #
        hex_color = hex_color.lstrip("#")

        if len(hex_color) != 6:
            return
        
        # Split bytestring into floats in 0.0 - 1.0 range
        color = unhexlify(hex_color)

        r  = ord(color[0]) / 255.
        g  = ord(color[1]) / 255.
        b  = ord(color[2]) / 255.
        w = 0

        return (r, g, b, w)


class RgbLightPattern(object):
    def __init__(self):
        self.refresh_interval = 0.5

    def get_color(self):
        pass

class RgbLightConstant(RgbLightPattern):
    def __init__(self, color):
        self.color = color
        self.refresh_interval = 0.5

    def get_color(self):
        return self.color

class RgbLightConstantImmediate(RgbLightPattern):
    def __init__(self, color):
        self.color = color
        self.refresh_interval = 0.02

    def get_color(self):
        return self.color

class RgbLightPulsing(RgbLightPattern):
    def __init__(self, color, speed = 0.5):
        self.refresh_interval = 0.01
        self._to = color
        self._from = (0,0,0,0)
        self.i = 0
        self.maxi = 100 / speed
        self._color = self._from

        self.deltar = (self._to[0] - self._from[0]) / (self.maxi/2)
        self.deltag = (self._to[1] - self._from[1]) / (self.maxi/2)
        self.deltab = (self._to[2] - self._from[2]) / (self.maxi/2)
        self.deltaw = (self._to[3] - self._from[3]) / (self.maxi/2)

    def get_color(self):

        if self.i >= self.maxi:
            self.i = 0
            self._color = self._from

        self.i += 1

        if self.i <= self.maxi/2:
            self._color = (min(self._color[0] + self.deltar, 1.0), min(self._color[1] + self.deltag, 1.0), min(self._color[2] + self.deltab, 1.0), min(self._color[3] + self.deltaw, 1.0))
        else:
            self._color = (max(self._color[0] - self.deltar, 0.0), max(self._color[1] - self.deltag, 0.0), max(self._color[2] - self.deltab, 0.0), max(self._color[3] - self.deltaw, 0.0))

        return self._color
