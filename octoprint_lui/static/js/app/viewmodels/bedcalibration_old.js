$(function ()  {
    function BedCalibrationViewModel(parameters) {
        var self = this;

        self.settings = parameters[0];
        self.loginState = parameters[1];
        self.flyout = parameters[2];
        self.printerState = parameters[3];
        self.introView = parameters[4];
        self.toolInfoViewModel = parameters[5];

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
        self.showPushInNozzles = ko.observable(false);
        self.showHeatNozzles = ko.observable(false);
        self.showHowToClean = ko.observable(false);
        self.showBringLeftDown = ko.observable(false);
        self.showBringRightDown = ko.observable(false);
        self.showHeatingOrCooling = ko.observable(false);
        self.showNormalCalibration = ko.observable(false);


        self.sendToCalibration = function(name){
          sendToApi("maintenance/bed/calibration/" + name);
        };
        

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
            $('.bed-canvas-item').removeClass('active');
        };

        self.onBedcalibrationFlyoutShown = function ()  {
            self.resetState();
        };

        self.abort = function()
        {
            self.flyout.closeFlyout();
            if(self.introView.isTutorialStarted){
                setTimeout(function () {
                    self.introView.introInstance.refresh();
                }, 300);
                self.introView.introInstance.goToStep(self.introView.getStepNumberByName("goToCalibrateBed"));
            }
        };

        self.accept = function()
        {
            self.bringhLeftNozzleDown(true);
            if (self.autoBedCalibrationComplete()) {
                self.restoreFromCalibrationPosition();
                self.resetState(); // Return to main screen, so user may start z-offset
            }
            else {
                if (self.showManualBedCalibration())
                    self.restoreFromCalibrationPosition();
                self.flyout.closeFlyoutAccept();
                //IntroJS
                if(self.introView.isTutorialStarted) {
                    self.introView.introInstance.goToStep(self.introView.getStepNumberByName("goToCalibrateExtruders"));
                    self.introView.introInstance.refresh();
                }
            }
        };

        self.leftNozzleDown = function()
        {
            sendToApi("maintenance/bed/calibrate/start");
            self.showManualBedCalibration(true);
            self.bringhLeftNozzleDown(true);
            self.mayAbort(false);
            self.mayAccept(true);
            //IntroJS
            if(self.introView.isTutorialStarted){
                setTimeout(function(){
                    self.introView.introInstance.refresh();
                }, 300);
                self.introView.introInstance.goToStep(self.introView.getStepNumberByName("calibrateBed"));
            }
        };

        self.startZoffset = function ()  {
            self.flyout.closeFlyoutAccept();
            self.flyout.showFlyout('zoffset');
        };

        self.startAutoBedCalibration = function ()  {
            self.showAutoBedCalibration(true);
            self.mayAbort(false);
            self.settings.sendCustomCommand({ type: 'command', command: 'G32', name: 'Level bed', showNotification: false });
        };

        self.moveToCorner = function(cornerNum)
        {
            sendToApi("maintenance/bed/calibrate/move_to_position/" + cornerNum);
        }

        self.restoreFromCalibrationPosition = function () {
            sendToApi("maintenance/bed/calibrate/finish");
        };

        $('.bed-canvas-item').click(function ()  {
            $(this).siblings().removeClass('active');
            $(this).addClass('active');

            self.moveToCorner($(this).data('corner'));
        });

        self.startManualBedCalibration = function() {
            self.showPushInNozzles(true);
            self.sendToCalibration("bringforward");
            self.mayAbort(true);
        }

        self.nozzlesPushedIn = function(){
            self.showPushInNozzles(false);
            self.showHeatNozzles(true);
            self.showHeatingOrCooling(true);
            sendToCalibration("heatandclean")
            //getFromApi("/maintenance/bed/calibration/heatAndClean").done
        };

        self.onHeatingCompleted = function (val){
            self.showHowToClean(true);
            self.showHeatingOrCooling(false);
        };

        self.nozzlesAreClean = function(){
            self.showHowToClean(false);
            sendToCalibration("pushLeftNozzleDown");
            self.bringhLeftNozzleDown(true);
        };

        self.calibrationDone = function(){
            self.showManualCalibration(false);
            sendToCalibration("pushRightNozzleDown");
            self.bringRightNozzleDown(true);
        };

        self.updateAutoBedCalibrationProgress = function(maxCorrectionValue){
            var progress = Math.max(0, 5 - maxCorrectionValue) / 5;

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
        };

        self.onDataUpdaterPluginMessage = function (plugin, data) {
            if (plugin != "lui") {
                return;
            }

            var messageType = data['type'];
            var messageData = data['data'];

            switch (messageType) {
                case "levelbed_progress":
                    self.updateAutoBedCalibrationProgress(messageData.maxCorrectionValue);
                    break;
                case "levelbed_complete":
                    self.updateAutoBedCalibrationProgress(0); // 0 = 100%
                    self.autoBedCalibrationProgressString("Complete");
                    self.autoBedCalibrationComplete(true);
                    self.mayAbort(false);
                    self.mayAccept(true);
                    break;
                case "heating_failed":
                    self.onHeatingFailed(messageData.calibration_type);
                    break;
                case "heating_completed":
                    self.onHeatingCompleted(messageData.calibration_type);
                    break;
            }
        };

        self.onBedCalibrationIntroExit = function () {
            self.abort();
        };

    }
    // This is how our plugin registers itself with the application, by adding some configuration
    // information to the global variable ADDITIONAL_VIEWMODELS
    ADDITIONAL_VIEWMODELS.push([
        // This is the constructor to call for instantiating the plugin
        BedCalibrationViewModel,

        // This is a list of dependencies to inject into the plugin, the order which you request
        // here is the order in which the dependencies will be injected into your view model upon
        // instantiation via the parameters argument
        ["settingsViewModel", "loginStateViewModel", "flyoutViewModel", "printerStateViewModel", "introViewModel", "toolInfoViewModel"],

        // Finally, this is the list of all elements we want this view model to be bound to.
        []
    ]);
});
