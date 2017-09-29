$(function () {
    function TutorialViewModel(parameters) {
        var self = this;

        self.flyout = parameters[0];
        self.introView = parameters[1];
        self.loginState = parameters[2];
        self.printerState = parameters[3];

        self.startTutorial = function (tutorialName) {
            self.flyout.closeFlyout();
            self.introView.startIntro(tutorialName);
        };

        self.toggleTutorialInfo = function () {
            $(".tutorial-info").toggleClass('hide');
        };
    }

    OCTOPRINT_VIEWMODELS.push([
        TutorialViewModel,
        ["flyoutViewModel", "introViewModel", "loginStateViewModel", "printerStateViewModel"],
        ["#tutorials_settings_flyout_content"]
    ]);
});
