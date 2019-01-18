$(function () {
    function RFIDViewModel(parameters) {
        var self = this;

        self.flyout = parameters[0];
        self.printerState = parameters[1];
        self.settings = parameters[2];
        self.toolInfo = parameters[3];
        self.filament = parameters[4];
        self.navigation = parameters[5];
        self.introView = parameters[6];

        self.poweringUpInfo = null;
        self.movingToHeadSwapPositionInfo = null;

        self.isHeadMaintenanceFlyoutOpen = false;
        self.isSavingMaterial = ko.observable(false);

        self.showRFIDReading = function () {

            var text = gettext("You are about to read a new filamenttag.");
            var question = gettext("Do you want to continue?");
            var title = gettext("Reading Filamenttag");
            var dialog = {'title': title, 'text': text, 'question' : question};

            self.flyout.showConfirmationFlyout(dialog, true)
                .done(function () {
                    self.ReadFilTag();
                    self.flyout.showFlyout('head_maintenance', true).always(self.afterHeadMaintenance);
                });
                
        };

        self.showFilRemoving = function () {

            var text = gettext("You are about to update & remove a Filament spool.");
            var question = gettext("Do you want to continue?");
            var title = gettext("Removing Filament");
            var dialog = {'title': title, 'text': text, 'question' : question};

            self.flyout.showConfirmationFlyout(dialog, true)
                .done(function () {
                    self.ReadFilTag();
                    self.flyout.showFlyout('head_maintenance', true).always(self.afterHeadMaintenance);
                });
        };

        self.ReadFilTag= function()
        {
            sendToApi("printer/rfid/read").done(function () {
                $.notify({ title: gettext("Reading Filament Tag"), text: gettext("The Filamenttag is being read.") }, "success");
            });
        }

        self.RemoveFilTag= function()
        {
            sendToApi("printer/rfid/remove").done(function () {
                $.notify({ title: gettext("Reading Filament Tag"), text: gettext("The Filamenttag is being read.") }, "success");
            });
        }
        //Te vinden: wat doet sendToApi, kunnen er tekstberichten verstuurd worden ipv Gcodes, Hoe kunnen reacties vanuit de printer ontvangen worden.