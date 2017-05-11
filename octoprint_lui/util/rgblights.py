from __future__ import division
import ctypes as ct
from binascii import unhexlify

class Driver(object):
    """
    TLC5947 LED driver.
    """
    BITS_PER_VALUE = 12
    N_LEDS = 4
    MAX_VALUE = 2 ** BITS_PER_VALUE - 1

    def __init__(self):
        n = self._n_leds = self.N_LEDS # * n_drivers
        self._values = [0] * n
        self._lib = ct.CDLL('libbcm2835.so')

        self._n_bytes = int(n * self.BITS_PER_VALUE / 8)
        self._t_array = ct.c_char * self._n_bytes

        self._lib.bcm2835_init();
        self._lib.bcm2835_spi_begin();
        self._lib.bcm2835_spi_chipSelect(0);
        self._lib.bcm2835_spi_setDataMode(0);
        self._lib.bcm2835_spi_setClockDivider(8192)

    def set_rgbw(self, r, g, b, w):
        self._values[0] = int(r * self.MAX_VALUE)
        self._values[1] = int(g * self.MAX_VALUE)
        self._values[2] = int(b * self.MAX_VALUE)
        self._values[3] = int(w * self.MAX_VALUE)
        self._write()

    def _write(self):
        tx = self._convert(self._values)
        self._lib.bcm2835_spi_writenb(tx, self._n_bytes);


    def _convert(self, values):
        s = ''.join('{:03x}'.format(v) for v in reversed(values))
        data = unhexlify(s)
        return self._t_array(*data)


    def __del__(self):
        self._lib.bcm2835_spi_end();
        self._lib.bcm2835_close();

class RgbLightsHandler(object):
    def __init__(self):
        self.driver = Driver()

    def set_color(self, hex_color):
        """
        Sets the color of the RGB leds based on a 3-byte hex string
        """

        # Remove any #
        hex_color = hex_color.lstrip("#")

        if len(hex_color) != 6:
            return
        
        # Split bytestring into floats in 0.0 - 1.0 range
        color = unhexlify(hex_color)

        r  = ord(color[0]) / 255.
        g  = ord(color[1]) / 255.
        b  = ord(color[2]) / 255.

        # Send the color to the driver
        self._set_rgb(r, g, b)
        
    def _set_rgb(self, r, g, b):
        w = 0.0 #TODO: Auto-calc w
        driver.set_rgbw(r, g, b, w);
