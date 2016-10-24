$(function ()  {
    function ExtruderCalibrationViewModel(parameters) {
        var self = this;

        self.settings = parameters[0];
        self.loginState = parameters[1];
        self.flyout = parameters[2];
        self.printerState = parameters[3];
        self.filament = parameters[4];

        self.mayStartLargeCalibration = ko.pureComputed(function ()  {
            return self.filament.leftFilament() != "None" && self.filament.rightFilament() != "None"
        });

        self.smallYAxisCorrection = ko.observable(0);

        self.smallBedWidthCorrection = ko.pureComputed({
            read: function ()  {
                var v = self.bedWidthCorrection();
                return Math.round((v - Math.round(v)) * 10);
            },
            write: function (value) {
                var newVal = value / 10 + self.largeBedWidthCorrection();
                self.bedWidthCorrection(newVal);
            }
        });

        self.largeBedWidthCorrection = ko.pureComputed({
            read: function ()  {
                var v = self.bedWidthCorrection();
                return Math.round(v);
            },
            write: function (value) {
                var newVal = value + self.smallBedWidthCorrection() / 10;
                self.bedWidthCorrection(newVal);
            }
        });

        self.bedWidthCorrection = ko.observable(0);

        self.calibrationProcessStarted = ko.observable(false);
        self.isPrintingCalibration = ko.observable(false);
        self.largeCalibrationCompleted = ko.observable(false);
        self.smallXCalibrationCompleted = ko.observable(false);
        self.smallYCalibrationCompleted = ko.observable(false);
        self.smallCalibrationPrepared = ko.observable(false);

        $(".width-calibrator > li").click(function ()  {
            var val = $(this).data('val');

            if ($(this).parent().attr('id') == "small-bed-width-correction")
                self.smallBedWidthCorrection(val);
            else
                self.largeBedWidthCorrection(val);
        });


        $("#y-axis-calibration > li").click(function ()  {
            var val = $(this).data('val');

            self.smallYAxisCorrection(val/10);
        });

        self.startLargeExtruderCalibration = function ()  {
            deferEventNotifications = true;
            self.calibrationProcessStarted(true);
            self.isPrintingCalibration(true);

            // First set calibration at 0, 0
            self.setCalibration(0, 0, false).done(function ()  {
                console.log("Calibration set to 0, 0")
                self._sendApi({ command: "start_calibration", calibration_type: "bed_width_large" });
            });
            
        };

        self.prepareSmallExtruderCalibration = function ()  {
            self.largeCalibrationCompleted(true);
        };

        self.startSmallExtruderCalibration = function ()  {
            self.smallCalibrationPrepared(true);
            self.isPrintingCalibration(true);

            // Send the large bed width correction to the printer and print the small calibration
            self.setCalibration(self.largeBedWidthCorrection(), 0, false).done(function ()  {
                console.log("Calibration set to " + self.largeBedWidthCorrection() + ", 0")
                self._sendApi({ command: "start_calibration", calibration_type: "bed_width_small" });
            });

        };

        self.showSmallYCalibration = function()
        {
            self.smallXCalibrationCompleted(true);
        }

        self.onCalibrationPrintCompleted = function (calibration_type) {
            self.isPrintingCalibration(false);
        }

        self.onCalibrationPrintFailed = function (calibration_type) {
            self.restoreState();

            //$.notify({ title: 'Calibration failed', text: 'An error has occured while printing the calibration patterns. Please try again.' }, "error");
        }

        self.restoreCalibration = function ()  {
            return self._sendApi({
                command: "restore_calibration_values"
            });
        }

        self.setCalibration = function(width_correction, extruder_offset_y, persist)
        {
            return self._sendApi({
                command: "set_calibration_values",
                width_correction: width_correction,
                extruder_offset_y: extruder_offset_y,
                persist: persist
            });
        }

        self.saveCalibration = function ()  {
            OctoPrint.printer.setToolTargetTemperatures({ 'tool0': 0, 'tool1': 0 });
            OctoPrint.printer.setBedTargetTemperature(0);

            self.setCalibration(self.bedWidthCorrection(), self.smallYAxisCorrection(), true)
                .done(function () 
                {
                    self.flyout.closeFlyoutAccept();
                    $.notify({ title: 'Calibration stored', text: 'The printer has been calibrated successfully.' }, "success");
                
                }).fail(function()
                {
                    $.notify({ title: 'Calibration failed', text: 'An error has occured while storing the calibration settings. Please try again.' }, "error");
                }).always(function ()  { self.restoreState(); self._sendApi({ command: "unselect_file" }); });
        };

        self.abort = function () 
        {
            OctoPrint.printer.setToolTargetTemperatures({ 'tool0': 0, 'tool1': 0 });
            OctoPrint.printer.setBedTargetTemperature(0);

            if (self.isPrintingCalibration()) {
                OctoPrint.job.cancel();    
            }
            
            if (self.calibrationProcessStarted()) {
                console.log("Unselecting file");
                self._sendApi({ command: "unselect_file" });
            }

            self.flyout.closeFlyoutAccept();
        }

        self.restoreState = function()
        {
            self.isPrintingCalibration(false);
            self.calibrationProcessStarted(false);
            self.largeCalibrationCompleted(false);
            self.smallXCalibrationCompleted(false);
            self.smallYCalibrationCompleted(false);
            self.smallCalibrationPrepared(false);

            deferEventNotifications = false;

            self.restoreCalibration();
        }

        self.onExtrudercalibrationFlyoutShown = function ()  {
            self.restoreState();
            self.requestData();

        }

        self.requestData = function ()  {
            self._getApi().done(self.fromResponse);
        }

        self.fromResponse = function (response) {
            if (response.machine_info.bed_width_correction)
                self.bedWidthCorrection(response.machine_info.bed_width_correction);

            if (response.machine_info.extruder_offset_y)
                self.smallYAxisCorrection(response.machine_info.extruder_offset_y);
        }

        self._sendApi = function (data) {
            url = OctoPrint.getSimpleApiUrl('lui');
            return OctoPrint.postJson(url, data);
        };

        self._getApi = function (data) {
            url = OctoPrint.getSimpleApiUrl('lui');
            return OctoPrint.get(url, data);
        };

        self.onAfterBinding = function ()  {
            self.bedWidthCorrection.subscribe(function (val) {

                var sm = self.smallBedWidthCorrection();
                var lg = self.largeBedWidthCorrection();

                $("#small-bed-width-correction > li").removeClass('active');
                $("#small-bed-width-correction > li[data-val=" + sm + "]").addClass('active');
                $("#large-bed-width-correction > li").removeClass('active');
                $("#large-bed-width-correction > li[data-val=" + lg + "]").addClass('active');
            });

            self.smallYAxisCorrection.subscribe(function (val)
            {
                $("#y-axis-calibration > li").removeClass('active');
                $("#y-axis-calibration > li[data-val=" + Math.round(val*10) + "]").addClass('active');
            })
        }

        self.onDataUpdaterPluginMessage = function (plugin, data) {
            if (plugin != "lui") {
                return;
            }

            var messageType = data['type'];
            var messageData = data['data'];

            switch (messageType) {
                case "calibration_failed":
                    self.onCalibrationPrintFailed(messageData.calibration_type);
                    break;
                case "calibration_completed":
                    self.onCalibrationPrintCompleted(messageData.calibration_type);
                    break;
            }
        }

    }
    // This is how our plugin registers itself with the application, by adding some configuration
    // information to the global variable ADDITIONAL_VIEWMODELS
    ADDITIONAL_VIEWMODELS.push([
        // This is the constructor to call for instantiating the plugin
        ExtruderCalibrationViewModel,

        // This is a list of dependencies to inject into the plugin, the order which you request
        // here is the order in which the dependencies will be injected into your view model upon
        // instantiation via the parameters argument
        ["settingsViewModel", "loginStateViewModel", "flyoutViewModel", "printerStateViewModel", "filamentViewModel"],

        // Finally, this is the list of all elements we want this view model to be bound to.
        ["#extrudercalibration_flyout"]
    ]);
});
