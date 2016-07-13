$(function () {
    function BedCalibrationViewModel(parameters) {
        var self = this;

        self.settings = parameters[0];
        self.loginState = parameters[1];
        self.settings = parameters[2];
        self.flyout = parameters[3];
        self.printerState = parameters[4];

        self.mayAbort = ko.observable(true);
        self.mayAccept = ko.observable(false);

        self.gaugeColorStart = [204, 43, 20];
        self.gaugeColorCenter = [237, 219, 83];
        self.gaugeColorTarget = [169, 204, 60];

        self.showManualBedCalibration = ko.observable(false);
        self.showAutoBedCalibration = ko.observable(false);
        self.autoBedCalibrationProgress = ko.observable(0);
        self.autoBedCalibrationProgressString = ko.observable(" ");
        self.autoBedCalibrationProgressColor = ko.observable("rgb(" + self.gaugeColorStart[0] + "," + self.gaugeColorStart[2] + "," + self.gaugeColorStart[1] + ")");        
        self.autoBedCalibrationComplete = ko.observable(false);

        self.resetState = function()
        {
            self.showManualBedCalibration(false);
            self.showAutoBedCalibration(false);
            self.autoBedCalibrationComplete(false);
            self.autoBedCalibrationProgressString(" ");
            self.autoBedCalibrationProgress(10);
            self.autoBedCalibrationProgressColor("rgb(" + self.gaugeColorStart[0] + "," + self.gaugeColorStart[2] + "," + self.gaugeColorStart[1] + ")");
            self.mayAbort(true);
            self.mayAccept(false);
        }

        self.onBedcalibrationFlyoutShown = function () {
            self.resetState();
            self.requestData();
        }

        self.abort = function()
        {
            self.flyout.closeFlyout();
        }

        self.accept = function()
        {
            if (self.autoBedCalibrationComplete())
                self.resetState(); // Return to main screen, so user may start z-offset
            else
                self.flyout.closeFlyoutAccept();
        }

        self.startManualBedCalibration = function()
        {
            self.showManualBedCalibration(true);
            self.mayAbort(false);
            self.mayAccept(true);
        }

        self.startZoffset = function () {
            self.flyout.closeFlyoutAccept();
            self.flyout.showFlyout('zoffset');
        };

        self.startAutoBedCalibration = function () {
            self.showAutoBedCalibration(true);
            self.mayAbort(false);
            self.settings.sendCustomCommand({ type: 'command', command: 'G32', name: 'Level bed', showNotification: false });
        };

        self.moveToCorner = function(cornerNum)
        {
            self._sendApi({ "command": "move_to_calibration_corner", "corner_num": cornerNum });
        }

        $('.bed-canvas-item').click(function () {
            $(this).siblings().removeClass('active');
            $(this).addClass('active');

            self.moveToCorner($(this).data('corner'));
        });

        self.requestData = function () {
           
        }

        self.fromResponse = function (response) {
            
        }

        self._sendApi = function (data) {
            url = OctoPrint.getSimpleApiUrl('lui');
            return OctoPrint.postJson(url, data);
        };

        self._getApi = function (data) {
            url = OctoPrint.getSimpleApiUrl('lui');
            return OctoPrint.get(url, data);
        };

        self.onAfterBinding = function () {
            
        }

        self.updateAutoBedCalibrationProgress = function(max_correction_value)
        {
            var progress = Math.max(0, 5 - max_correction_value) / 5;

            var gaugeColor = self.gaugeColorStart;

            for (i = 0; i<3; i++)
            {
                if (progress <= 0.5) //Interpolate startcolor to centercolor
                    gaugeColor[i] = self.gaugeColorStart[i] + 2 * progress * (self.gaugeColorCenter[i] - self.gaugeColorStart[i]);
                else //Interpolate centercolor to endcolor
                    gaugeColor[i] = self.gaugeColorCenter[i] + 2 * (progress - 0.5) * (self.gaugeColorTarget[i] - self.gaugeColorCenter[i]);
                    
            }

            var progressColorStr = "rgb(" + Math.round(gaugeColor[0]) + "," + Math.round(gaugeColor[1]) + "," + Math.round(gaugeColor[2]) + ")";

            self.autoBedCalibrationProgressColor(progressColorStr);
            self.autoBedCalibrationProgress(Math.round(10 + progress * 90));
        }

        self.onDataUpdaterPluginMessage = function (plugin, data) {
            if (plugin != "lui") {
                return;
            }

            var messageType = data['type'];
            var messageData = data['data'];

            switch (messageType) {
                case "levelbed_progress":
                    self.updateAutoBedCalibrationProgress(messageData.max_correction_value);
                    break;
                case "levelbed_complete":
                    self.updateAutoBedCalibrationProgress(0); // 0 = 100%
                    self.updateAutoBedCalibrationProgressString("Complete");
                    self.autoBedCalibrationComplete(true);
                    self.mayAbort(false);
                    self.mayAccept(true);
                    break;
            }
        }

    }
    // This is how our plugin registers itself with the application, by adding some configuration
    // information to the global variable ADDITIONAL_VIEWMODELS
    ADDITIONAL_VIEWMODELS.push([
        // This is the constructor to call for instantiating the plugin
        BedCalibrationViewModel,

        // This is a list of dependencies to inject into the plugin, the order which you request
        // here is the order in which the dependencies will be injected into your view model upon
        // instantiation via the parameters argument
        ["settingsViewModel", "loginStateViewModel", "settingsViewModel", "flyoutViewModel", "printerStateViewModel"],

        // Finally, this is the list of all elements we want this view model to be bound to.
        ["#bedcalibration_flyout"]
    ]);
});
