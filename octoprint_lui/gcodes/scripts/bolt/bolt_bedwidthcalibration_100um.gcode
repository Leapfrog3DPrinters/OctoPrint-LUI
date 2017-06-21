; This script is auto-generated with bolt_scripts_generator
G28
T0
M109 T0
M109 T1
M190
M107
G28
G90
;Begin Tool 0
T0
G1 Z0.300 F1800.000
G92 E0; zero extruder
G1 Y-33.00 F12000; move to front of machine
G1 E15 F6000; extrude 15 mm fast
G1 E30 F150 ; extrude another 15 mm slow
G1 E28 F6000 ; retract 2mm
G4 S2; wait for 2 seconds
; perform wipe sequence
G1 X310.000 F12000
G1 X328.000 F12000
G1 X310.000 F12000
G1 X328.000 F12000
G92 E0; zero extruder
;Vertical line #0 Tool 0
G1 X96.500 Y190.000 F12000.000
G1 Z0.150 F1800.000
G1 E2.100 F3000.000
G1 X96.500 Y240.000 E3.327 F1800.000
G1 E1.327 F3000.000
;Vertical line #1 Tool 0
G1 X106.500 Y190.000 F12000.000
G1 E3.427 F3000.000
G1 X106.500 Y240.000 E4.655 F1800.000
G1 E2.655 F3000.000
;Vertical line #2 Tool 0
G1 X116.500 Y190.000 F12000.000
G1 E4.755 F3000.000
G1 X116.500 Y240.000 E5.982 F1800.000
G1 E3.982 F3000.000
;Vertical line #3 Tool 0
G1 X126.500 Y190.000 F12000.000
G1 E6.082 F3000.000
G1 X126.500 Y240.000 E7.309 F1800.000
G1 E5.309 F3000.000
;Vertical line #4 Tool 0
G1 X136.500 Y190.000 F12000.000
G1 E7.409 F3000.000
G1 X136.500 Y240.000 E8.636 F1800.000
G1 E6.636 F3000.000
;Begin circle
G1 X150.500 Y180.000 E6.636 F12000.000
G1 E8.736 F3000.000
G1 X150.467 Y180.512 E8.749 F1800.000
G1 X150.369 Y181.015 E8.761 F1800.000
G1 X150.208 Y181.501 E8.773 F1800.000
G1 X149.985 Y181.963 E8.786 F1800.000
G1 X149.706 Y182.392 E8.798 F1800.000
G1 X149.373 Y182.783 E8.810 F1800.000
G1 X148.994 Y183.127 E8.823 F1800.000
G1 X148.574 Y183.421 E8.835 F1800.000
G1 X148.119 Y183.658 E8.847 F1800.000
G1 X147.638 Y183.835 E8.860 F1800.000
G1 X147.138 Y183.949 E8.872 F1800.000
G1 X146.628 Y183.998 E8.884 F1800.000
G1 X146.116 Y183.982 E8.897 F1800.000
G1 X145.610 Y183.900 E8.909 F1800.000
G1 X145.119 Y183.754 E8.921 F1800.000
G1 X144.650 Y183.546 E8.934 F1800.000
G1 X144.212 Y183.281 E8.946 F1800.000
G1 X143.811 Y182.961 E8.958 F1800.000
G1 X143.454 Y182.593 E8.971 F1800.000
G1 X143.148 Y182.182 E8.983 F1800.000
G1 X142.896 Y181.736 E8.995 F1800.000
G1 X142.704 Y181.260 E9.008 F1800.000
G1 X142.574 Y180.765 E9.020 F1800.000
G1 X142.508 Y180.256 E9.032 F1800.000
G1 X142.508 Y179.744 E9.045 F1800.000
G1 X142.574 Y179.235 E9.057 F1800.000
G1 X142.704 Y178.740 E9.069 F1800.000
G1 X142.896 Y178.264 E9.082 F1800.000
G1 X143.148 Y177.818 E9.094 F1800.000
G1 X143.454 Y177.407 E9.106 F1800.000
G1 X143.811 Y177.039 E9.119 F1800.000
G1 X144.212 Y176.719 E9.131 F1800.000
G1 X144.650 Y176.454 E9.143 F1800.000
G1 X145.119 Y176.246 E9.156 F1800.000
G1 X145.610 Y176.100 E9.168 F1800.000
G1 X146.116 Y176.018 E9.181 F1800.000
G1 X146.628 Y176.002 E9.193 F1800.000
G1 X147.138 Y176.051 E9.205 F1800.000
G1 X147.638 Y176.165 E9.218 F1800.000
G1 X148.119 Y176.342 E9.230 F1800.000
G1 X148.574 Y176.579 E9.242 F1800.000
G1 X148.994 Y176.873 E9.255 F1800.000
G1 X149.373 Y177.217 E9.267 F1800.000
G1 X149.706 Y177.608 E9.279 F1800.000
G1 X149.985 Y178.037 E9.292 F1800.000
G1 X150.208 Y178.499 E9.304 F1800.000
G1 X150.369 Y178.985 E9.316 F1800.000
G1 X150.467 Y179.488 E9.329 F1800.000
G1 X150.500 Y180.000 E9.341 F1800.000
G1 E7.341 F3000.000
;Vertical line #5 Tool 0
G1 X146.500 Y190.000 F12000.000
G1 E9.441 F3000.000
G1 X146.500 Y240.000 E10.668 F1800.000
G1 E8.668 F3000.000
;Vertical line #6 Tool 0
G1 X156.500 Y190.000 F12000.000
G1 E10.768 F3000.000
G1 X156.500 Y240.000 E11.995 F1800.000
G1 E9.995 F3000.000
;Vertical line #7 Tool 0
G1 X166.500 Y190.000 F12000.000
G1 E12.095 F3000.000
G1 X166.500 Y240.000 E13.323 F1800.000
G1 E11.323 F3000.000
;Vertical line #8 Tool 0
G1 X176.500 Y190.000 F12000.000
G1 E13.423 F3000.000
G1 X176.500 Y240.000 E14.650 F1800.000
G1 E12.650 F3000.000
;Vertical line #9 Tool 0
G1 X186.500 Y190.000 F12000.000
G1 E14.750 F3000.000
G1 X186.500 Y240.000 E15.977 F1800.000
G1 E13.977 F3000.000
;Vertical line #10 Tool 0
G1 X196.500 Y190.000 F12000.000
G1 E16.077 F3000.000
G1 X196.500 Y240.000 E17.305 F1800.000
G1 E15.305 F3000.000
G1 Z0.300 F1800.000
;Horizontal line #0 Tool 0
G1 X121.500 Y170.000 F12000.000
G1 Z0.150 F1800.000
G1 E17.405 F3000.000
G1 X171.500 Y170.000 E18.632 F1800.000
G1 E16.632 F3000.000
;Horizontal line #1 Tool 0
G1 X121.500 Y160.000 F12000.000
G1 E18.732 F3000.000
G1 X171.500 Y160.000 E19.959 F1800.000
G1 E17.959 F3000.000
;Horizontal line #2 Tool 0
G1 X121.500 Y150.000 F12000.000
G1 E20.059 F3000.000
G1 X171.500 Y150.000 E21.286 F1800.000
G1 E19.286 F3000.000
;Horizontal line #3 Tool 0
G1 X121.500 Y140.000 F12000.000
G1 E21.386 F3000.000
G1 X171.500 Y140.000 E22.614 F1800.000
G1 E20.614 F3000.000
;Horizontal line #4 Tool 0
G1 X121.500 Y130.000 F12000.000
G1 E22.714 F3000.000
G1 X171.500 Y130.000 E23.941 F1800.000
G1 E21.941 F3000.000
;Horizontal line #5 Tool 0
G1 X121.500 Y120.000 F12000.000
G1 E24.041 F3000.000
G1 X171.500 Y120.000 E25.268 F1800.000
G1 E23.268 F3000.000
;Horizontal line #6 Tool 0
G1 X121.500 Y110.000 F12000.000
G1 E25.368 F3000.000
G1 X171.500 Y110.000 E26.595 F1800.000
G1 E24.595 F3000.000
;Horizontal line #7 Tool 0
G1 X121.500 Y100.000 F12000.000
G1 E26.695 F3000.000
G1 X171.500 Y100.000 E27.923 F1800.000
G1 E25.923 F3000.000
;Begin circle
G1 X115.500 Y90.000 E25.923 F12000.000
G1 E28.023 F3000.000
G1 X115.467 Y90.512 E28.035 F1800.000
G1 X115.369 Y91.015 E28.047 F1800.000
G1 X115.208 Y91.501 E28.060 F1800.000
G1 X114.985 Y91.963 E28.072 F1800.000
G1 X114.706 Y92.392 E28.084 F1800.000
G1 X114.373 Y92.783 E28.097 F1800.000
G1 X113.994 Y93.127 E28.109 F1800.000
G1 X113.574 Y93.421 E28.121 F1800.000
G1 X113.119 Y93.658 E28.134 F1800.000
G1 X112.638 Y93.835 E28.146 F1800.000
G1 X112.138 Y93.949 E28.158 F1800.000
G1 X111.628 Y93.998 E28.171 F1800.000
G1 X111.116 Y93.982 E28.183 F1800.000
G1 X110.610 Y93.900 E28.195 F1800.000
G1 X110.119 Y93.754 E28.208 F1800.000
G1 X109.650 Y93.546 E28.220 F1800.000
G1 X109.212 Y93.281 E28.232 F1800.000
G1 X108.811 Y92.961 E28.245 F1800.000
G1 X108.454 Y92.593 E28.257 F1800.000
G1 X108.148 Y92.182 E28.269 F1800.000
G1 X107.896 Y91.736 E28.282 F1800.000
G1 X107.704 Y91.260 E28.294 F1800.000
G1 X107.574 Y90.765 E28.306 F1800.000
G1 X107.508 Y90.256 E28.319 F1800.000
G1 X107.508 Y89.744 E28.331 F1800.000
G1 X107.574 Y89.235 E28.343 F1800.000
G1 X107.704 Y88.740 E28.356 F1800.000
G1 X107.896 Y88.264 E28.368 F1800.000
G1 X108.148 Y87.818 E28.380 F1800.000
G1 X108.454 Y87.407 E28.393 F1800.000
G1 X108.811 Y87.039 E28.405 F1800.000
G1 X109.212 Y86.719 E28.417 F1800.000
G1 X109.650 Y86.454 E28.430 F1800.000
G1 X110.119 Y86.246 E28.442 F1800.000
G1 X110.610 Y86.100 E28.455 F1800.000
G1 X111.116 Y86.018 E28.467 F1800.000
G1 X111.628 Y86.002 E28.479 F1800.000
G1 X112.138 Y86.051 E28.492 F1800.000
G1 X112.638 Y86.165 E28.504 F1800.000
G1 X113.119 Y86.342 E28.516 F1800.000
G1 X113.574 Y86.579 E28.529 F1800.000
G1 X113.994 Y86.873 E28.541 F1800.000
G1 X114.373 Y87.217 E28.553 F1800.000
G1 X114.706 Y87.608 E28.566 F1800.000
G1 X114.985 Y88.037 E28.578 F1800.000
G1 X115.208 Y88.499 E28.590 F1800.000
G1 X115.369 Y88.985 E28.603 F1800.000
G1 X115.467 Y89.488 E28.615 F1800.000
G1 X115.500 Y90.000 E28.627 F1800.000
G1 E26.627 F3000.000
;Horizontal line #8 Tool 0
G1 X121.500 Y90.000 F12000.000
G1 E28.727 F3000.000
G1 X171.500 Y90.000 E29.955 F1800.000
G1 E27.955 F3000.000
;Horizontal line #9 Tool 0
G1 X121.500 Y80.000 F12000.000
G1 E30.055 F3000.000
G1 X171.500 Y80.000 E31.282 F1800.000
G1 E29.282 F3000.000
;Horizontal line #10 Tool 0
G1 X121.500 Y70.000 F12000.000
G1 E31.382 F3000.000
G1 X171.500 Y70.000 E32.609 F1800.000
G1 E30.609 F3000.000
;Horizontal line #11 Tool 0
G1 X121.500 Y60.000 F12000.000
G1 E32.709 F3000.000
G1 X171.500 Y60.000 E33.936 F1800.000
G1 E31.936 F3000.000
;Horizontal line #12 Tool 0
G1 X121.500 Y50.000 F12000.000
G1 E34.036 F3000.000
G1 X171.500 Y50.000 E35.264 F1800.000
G1 E33.264 F3000.000
;Horizontal line #13 Tool 0
G1 X121.500 Y40.000 F12000.000
G1 E35.364 F3000.000
G1 X171.500 Y40.000 E36.591 F1800.000
G1 E34.591 F3000.000
;Horizontal line #14 Tool 0
G1 X121.500 Y30.000 F12000.000
G1 E36.691 F3000.000
G1 X171.500 Y30.000 E37.918 F1800.000
G1 E35.918 F3000.000
;Horizontal line #15 Tool 0
G1 X121.500 Y20.000 F12000.000
G1 E38.018 F3000.000
G1 X171.500 Y20.000 E39.245 F1800.000
G1 E37.245 F3000.000
;Horizontal line #16 Tool 0
G1 X121.500 Y10.000 F12000.000
G1 E39.345 F3000.000
G1 X171.500 Y10.000 E40.573 F1800.000
G1 E38.573 F3000.000
;Begin Tool 1
T1
G1 Z0.450 F1800.000
G92 E0; zero extruder
G1 Y-33.00 F12000; move to front of machine
G1 E15 F6000; extrude 15 mm fast
G1 E30 F150 ; extrude another 15 mm slow
G1 E28 F6000 ; retract 2mm
G4 S2; wait for 2 seconds
; perform wipe sequence
G1 X-17.000 F12000
G1 X-35.000 F12000
G1 X-17.000 F12000
G1 X-35.000 F12000
G92 E0; zero extruder
;Vertical line #0 Tool 1
G1 X96.000 Y190.000 F12000.000
G1 Z0.300 F1800.000
G1 E2.100 F3000.000
G1 X96.000 Y240.000 E3.327 F1800.000
G1 E1.327 F3000.000
;Vertical line #1 Tool 1
G1 X106.100 Y190.000 F12000.000
G1 E3.427 F3000.000
G1 X106.100 Y240.000 E4.655 F1800.000
G1 E2.655 F3000.000
;Vertical line #2 Tool 1
G1 X116.200 Y190.000 F12000.000
G1 E4.755 F3000.000
G1 X116.200 Y240.000 E5.982 F1800.000
G1 E3.982 F3000.000
;Vertical line #3 Tool 1
G1 X126.300 Y190.000 F12000.000
G1 E6.082 F3000.000
G1 X126.300 Y240.000 E7.309 F1800.000
G1 E5.309 F3000.000
;Vertical line #4 Tool 1
G1 X136.400 Y190.000 F12000.000
G1 E7.409 F3000.000
G1 X136.400 Y240.000 E8.636 F1800.000
G1 E6.636 F3000.000
;Vertical line #5 Tool 1
G1 X146.500 Y190.000 F12000.000
G1 E8.736 F3000.000
G1 X146.500 Y240.000 E9.964 F1800.000
G1 E7.964 F3000.000
;Vertical line #6 Tool 1
G1 X156.600 Y190.000 F12000.000
G1 E10.064 F3000.000
G1 X156.600 Y240.000 E11.291 F1800.000
G1 E9.291 F3000.000
;Vertical line #7 Tool 1
G1 X166.700 Y190.000 F12000.000
G1 E11.391 F3000.000
G1 X166.700 Y240.000 E12.618 F1800.000
G1 E10.618 F3000.000
;Vertical line #8 Tool 1
G1 X176.800 Y190.000 F12000.000
G1 E12.718 F3000.000
G1 X176.800 Y240.000 E13.945 F1800.000
G1 E11.945 F3000.000
;Vertical line #9 Tool 1
G1 X186.900 Y190.000 F12000.000
G1 E14.045 F3000.000
G1 X186.900 Y240.000 E15.273 F1800.000
G1 E13.273 F3000.000
;Vertical line #10 Tool 1
G1 X197.000 Y190.000 F12000.000
G1 E15.373 F3000.000
G1 X197.000 Y240.000 E16.600 F1800.000
G1 E14.600 F3000.000
G1 Z0.450 F1800.000
;Horizontal line #0 Tool 1
G1 X121.500 Y170.800 F12000.000
G1 Z0.300 F1800.000
G1 E16.700 F3000.000
G1 X171.500 Y170.800 E17.927 F1800.000
G1 E15.927 F3000.000
;Horizontal line #1 Tool 1
G1 X121.500 Y160.700 F12000.000
G1 E18.027 F3000.000
G1 X171.500 Y160.700 E19.255 F1800.000
G1 E17.255 F3000.000
;Horizontal line #2 Tool 1
G1 X121.500 Y150.600 F12000.000
G1 E19.355 F3000.000
G1 X171.500 Y150.600 E20.582 F1800.000
G1 E18.582 F3000.000
;Horizontal line #3 Tool 1
G1 X121.500 Y140.500 F12000.000
G1 E20.682 F3000.000
G1 X171.500 Y140.500 E21.909 F1800.000
G1 E19.909 F3000.000
;Horizontal line #4 Tool 1
G1 X121.500 Y130.400 F12000.000
G1 E22.009 F3000.000
G1 X171.500 Y130.400 E23.236 F1800.000
G1 E21.236 F3000.000
;Horizontal line #5 Tool 1
G1 X121.500 Y120.300 F12000.000
G1 E23.336 F3000.000
G1 X171.500 Y120.300 E24.564 F1800.000
G1 E22.564 F3000.000
;Horizontal line #6 Tool 1
G1 X121.500 Y110.200 F12000.000
G1 E24.664 F3000.000
G1 X171.500 Y110.200 E25.891 F1800.000
G1 E23.891 F3000.000
;Horizontal line #7 Tool 1
G1 X121.500 Y100.100 F12000.000
G1 E25.991 F3000.000
G1 X171.500 Y100.100 E27.218 F1800.000
G1 E25.218 F3000.000
;Horizontal line #8 Tool 1
G1 X121.500 Y90.000 F12000.000
G1 E27.318 F3000.000
G1 X171.500 Y90.000 E28.545 F1800.000
G1 E26.545 F3000.000
;Horizontal line #9 Tool 1
G1 X121.500 Y79.900 F12000.000
G1 E28.645 F3000.000
G1 X171.500 Y79.900 E29.873 F1800.000
G1 E27.873 F3000.000
;Horizontal line #10 Tool 1
G1 X121.500 Y69.800 F12000.000
G1 E29.973 F3000.000
G1 X171.500 Y69.800 E31.200 F1800.000
G1 E29.200 F3000.000
;Horizontal line #11 Tool 1
G1 X121.500 Y59.700 F12000.000
G1 E31.300 F3000.000
G1 X171.500 Y59.700 E32.527 F1800.000
G1 E30.527 F3000.000
;Horizontal line #12 Tool 1
G1 X121.500 Y49.600 F12000.000
G1 E32.627 F3000.000
G1 X171.500 Y49.600 E33.854 F1800.000
G1 E31.854 F3000.000
;Horizontal line #13 Tool 1
G1 X121.500 Y39.500 F12000.000
G1 E33.954 F3000.000
G1 X171.500 Y39.500 E35.182 F1800.000
G1 E33.182 F3000.000
;Horizontal line #14 Tool 1
G1 X121.500 Y29.400 F12000.000
G1 E35.282 F3000.000
G1 X171.500 Y29.400 E36.509 F1800.000
G1 E34.509 F3000.000
;Horizontal line #15 Tool 1
G1 X121.500 Y19.300 F12000.000
G1 E36.609 F3000.000
G1 X171.500 Y19.300 E37.836 F1800.000
G1 E35.836 F3000.000
;Horizontal line #16 Tool 1
G1 X121.500 Y9.200 F12000.000
G1 E37.936 F3000.000
G1 X171.500 Y9.200 E39.164 F1800.000
G1 E37.164 F3000.000
G1 Z20 F600
G28 X0 Y0
M84
M107
M400
