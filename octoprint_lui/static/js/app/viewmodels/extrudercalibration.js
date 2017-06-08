$(function ()  {
    function ExtruderCalibrationViewModel(parameters) {
        var self = this;

        self.settings = parameters[0];
        self.loginState = parameters[1];
        self.flyout = parameters[2];
        self.printerState = parameters[3];
        self.temperatures = parameters[4];
        self.introView = parameters[5];

        self.getToolName = function (tool)
        {
            switch (tool) {
                case 'tool0':
                    return gettext('right');
                case 'tool1':
                    return gettext('left');
            }
        };

        self.mayStartLargeCalibration = ko.pureComputed(function ()  {
            return !_.some(self.temperatures.tools(), function (tool) { return tool.filament.materialProfileName() == "None" });
        });

        self.smallYAxisCorrection = ko.observable(0);

        self.smallBedWidthCorrection = ko.observable(0);
        self.largeBedWidthCorrection = ko.observable(0);

        self.bedWidthCorrection = ko.pureComputed(
        {
            read: function () {
                return self.largeBedWidthCorrection() + self.smallBedWidthCorrection() / 10
            },
            write: function(v)
            {
                self.smallBedWidthCorrection(Math.round((v - Math.round(v)) * 10));
                self.largeBedWidthCorrection(Math.round(v));
            }
        });

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
                console.log("Calibration set to 0, 0");
                sendToApi("maintenance/head/calibrate/start/bed_width_large");
            });
            //IntroJS
            if(self.introView.isTutorialStarted) {
                var checkIfPrinting = setInterval(function () {
                        if(self.printerState.isPrinting()){
                            clearInterval(checkIfPrinting);
                            self.introView.introInstance.goToStep(self.introView.getStepNumberByName("printingLargeCalibration"));
                        }
                    }, 100);
            }
        };

        self.prepareSmallExtruderCalibration = function ()  {
            self.largeCalibrationCompleted(true);
            //IntroJS
            if(self.introView.isTutorialStarted) {
                setTimeout(function () {
                    self.introView.introInstance.refresh();
                }, 1000);
                self.introView.introInstance.goToStep(self.introView.getStepNumberByName("startSmallCalibration"));
            }
        };

        self.startSmallExtruderCalibration = function ()  {
            self.smallCalibrationPrepared(true);
            self.isPrintingCalibration(true);

            // Send the large bed width correction to the printer and print the small calibration
            self.setCalibration(self.largeBedWidthCorrection(), 0, false).done(function ()  {
                console.log("Calibration set to " + self.largeBedWidthCorrection() + ", 0");
                sendToApi("maintenance/head/calibrate/start/bed_width_small");
            });
            //IntroJS
            if(self.introView.isTutorialStarted) {
                var checkIfPrinting = setInterval(function () {
                        if(self.printerState.isPrinting()){
                            clearInterval(checkIfPrinting);
                            self.introView.introInstance.goToStep(self.introView.getStepNumberByName("printingSmallCalibration"));
                        }
                    }, 100);
            }
        };

        self.showSmallYCalibration = function()
        {
            self.smallXCalibrationCompleted(true);
            //IntroJS
            if(self.introView.isTutorialStarted) {
                setTimeout(function () {
                    self.introView.introInstance.refresh();
                }, 300);
                self.introView.introInstance.goToStep(self.introView.getStepNumberByName("selectYSmall"));
            }
        }

        self.onCalibrationPrintCompleted = function (calibration_type) {
            self.isPrintingCalibration(false);
            if(self.introView.isTutorialStarted) {
                setTimeout(function () {
                    self.introView.introInstance.refresh();
                }, 300);
                if(calibration_type == 'bed_width_large') {
                    self.introView.introInstance.goToStep(self.introView.getStepNumberByName("largeCalibrationDone"));
                }
                else{
                    self.introView.introInstance.goToStep(self.introView.getStepNumberByName("selectXSmall"));
                }
            }
        }

        self.onCalibrationPrintFailed = function (calibration_type) {
            self.restoreState();

            //$.notify({ title: 'Calibration failed', text: 'An error has occured while printing the calibration patterns. Please try again.' }, "error");
        };

        self.restoreCalibration = function ()  {
            return sendToApi("maintenance/head/calibrate/restore_values");
        };

        self.changeLargeBedWidthCalibration = function(value)
        {
            var newVal = self.largeBedWidthCorrection() + value;

            if (newVal >= -8 && newVal <= 8)
                self.largeBedWidthCorrection(newVal);
        };

        self.changeSmallBedWidthCalibration = function (value) {
            var newVal = self.smallBedWidthCorrection() + value;

            if (newVal >= -5 && newVal <= 5)
                self.smallBedWidthCorrection(newVal);
        };

        self.setCalibration = function(width_correction, extruder_offset_y, persist)
        {
            return sendToApi("maintenance/head/calibrate/set_values",
                {
                    width_correction: width_correction,
                    extruder_offset_y: extruder_offset_y,
                    persist: persist
                }
            );
        };

        self.saveCalibration = function ()  {
            OctoPrint.printer.setToolTargetTemperatures({ 'tool0': 0, 'tool1': 0 });
            OctoPrint.printer.setBedTargetTemperature(0);

            self.setCalibration(self.bedWidthCorrection(), self.smallYAxisCorrection(), true)
                .done(function ()
                {
                    self.flyout.closeFlyoutAccept();
                    $.notify({ title: gettext('Calibration stored'), text: gettext('The printer has been calibrated successfully.') }, "success");

                }).fail(function()
                {
                    $.notify({ title: gettext('Calibration failed'), text: gettext('An error has occured while storing the calibration settings. Please try again.') }, "error");
                }).always(function ()  { self.restoreState(); sendToApi("files/unselect"); });
            //IntroJS
            if(self.introView.isTutorialStarted) {
                self.flyout.closeFlyout();
                setTimeout(function () {
                    self.introView.introInstance.refresh();
                }, 1000);
                self.introView.introInstance.goToStep(self.introView.getStepNumberByName("selectPrintJob"));
            }
        };

        self.abort = function ()
        {
            OctoPrint.printer.setToolTargetTemperatures({ 'tool0': 0, 'tool1': 0 });
            OctoPrint.printer.setBedTargetTemperature(0);

            if (self.isPrintingCalibration()) {
                sendToApi("printer/immediate_cancel");
            }

            if (self.calibrationProcessStarted()) {
                console.log("Unselecting file");
                sendToApi("files/unselect");
            }

            

            self.flyout.closeFlyoutAccept();
        };

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
        };

        self.onExtrudercalibrationFlyoutShown = function ()  {
            self.restoreState();
            self.requestData();

        };

        self.requestData = function ()  {
            getFromApi('printer/machine_info').done(self.fromResponse);
        }

        self.fromResponse = function (response) {
            if (response.machine_info.bed_width_correction)
                self.bedWidthCorrection(parseFloat(response.machine_info.bed_width_correction));

            if (response.machine_info.extruder_offset_y)
                self.smallYAxisCorrection(parseFloat(response.machine_info.extruder_offset_y));
        };

        self.onAfterBinding = function ()  {
            self.smallBedWidthCorrection.subscribe(function (val) {
                $("#small-bed-width-correction > li").removeClass('active');
                $("#small-bed-width-correction > li[data-val=" + val + "]").addClass('active');
            });

            self.largeBedWidthCorrection.subscribe(function (val) {
                $("#large-bed-width-correction > li").removeClass('active');
                $("#large-bed-width-correction > li[data-val=" + val + "]").addClass('active');
            });

            self.smallYAxisCorrection.subscribe(function (val)
            {
                $("#y-axis-calibration > li").removeClass('active');
                $("#y-axis-calibration > li[data-val=" + Math.round(val*10) + "]").addClass('active');
            })
        };

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

        self.onExtruderCalibrationIntroExit = function () {
            self.abort();
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
        ["settingsViewModel", "loginStateViewModel", "flyoutViewModel", "printerStateViewModel", "toolInfoViewModel", "introViewModel"],

        // Finally, this is the list of all elements we want this view model to be bound to.
        ["#extrudercalibration_flyout"]
    ]);
});
