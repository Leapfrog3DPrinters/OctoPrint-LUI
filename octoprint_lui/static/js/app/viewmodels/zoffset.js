$(function ()  {
    //TODO: Maybe refactor into bedcalibration.js?
    function ZOffsetViewModel(parameters) {
        var self = this;

        self.settings = parameters[0];
        self.loginState = parameters[1];
        self.settings = parameters[2];
        self.flyout = parameters[3];
        self.printerState = parameters[4];

        self.calibration_zOffset = ko.observable(0);
        self.startedCalibration = ko.observable(false);

        self.increaseZ = function(distance) {
            self.sendJogCommand('z', 1, distance);
            self.calibration_zOffset((self.calibration_zOffset()*1000 + distance*1000)/1000);

        };

        self.decreaseZ = function(distance) {
            self.sendJogCommand('z', -1, distance);
            self.calibration_zOffset((self.calibration_zOffset()*1000 - distance*1000)/1000);

        };

        self.startZcalibration = function () {
            self.sendHomeCommand('z');
            self.startedCalibration(true);

        };

        self.saveCalibration = function () {
            self.settings.settings.plugins.lui.zoffset(self.calibration_zOffset());
            self.settings.saveData();
            self.flyout.closeFlyoutAccept();
        };

        self.onAfterBinding = function () {
            $("#zOffset_dialog").on("show", function(){
                self.onDialogShown();
            });
        };

        self.sendJogCommand = function (axis, multiplier, distance) {

            var data = {};
            data[axis] = distance * multiplier;
            OctoPrint.printer.jog(data);
        };

        self.sendHomeCommand = function (axis) {
            OctoPrint.printer.home(axis);
        };

        self.onZoffsetFlyoutShown = function () {
            self.calibration_zOffset(0);
            self.startedCalibration(false);
        }

        self._sendApi = function (data) {
            url = OctoPrint.getSimpleApiUrl('lui');
            OctoPrint.postJson(url, data);
        };

        self.moveToMaintenancePosition = function () {
            self._sendApi({
                command: 'move_to_maintenance_position'
            });
        };

    }
    // This is how our plugin registers itself with the application, by adding some configuration
    // information to the global variable ADDITIONAL_VIEWMODELS
    ADDITIONAL_VIEWMODELS.push([
        // This is the constructor to call for instantiating the plugin
        ZOffsetViewModel,

        // This is a list of dependencies to inject into the plugin, the order which you request
        // here is the order in which the dependencies will be injected into your view model upon
        // instantiation via the parameters argument
        ["settingsViewModel", "loginStateViewModel", "settingsViewModel", "flyoutViewModel", "printerStateViewModel"],

        // Finally, this is the list of all elements we want this view model to be bound to.
        ["#zoffset_flyout"]
    ]);
});
