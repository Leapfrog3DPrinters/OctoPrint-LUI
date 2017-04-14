$(function () {
    function TutorialViewModel(parameters) {
        var self = this;

        self.flyout = parameters[0];
        self.introView = parameters[1];
        self.loginState = parameters[2];
        self.filament = parameters[3];

        self.startTutorial = function (tutorialName) {
            self.flyout.closeFlyout();
            self.introView.startIntro(tutorialName);
        };
    }

    OCTOPRINT_VIEWMODELS.push([
        TutorialViewModel,
        ["flyoutViewModel", "introViewModel", "loginStateViewModel", "filamentViewModel"],
        ["#tutorials_settings_flyout_content"]
    ]);
});
