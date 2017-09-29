$(function () {
    function RgbViewModel(parameters) {
        var self = this;
        //TODO: Function not ready. Pure testing.
        self.flyout = parameters[0];
        self.introView = parameters[1];
        self.loginState = parameters[2];
        self.printerState = parameters[3];
        self.result;
        self.profilename;
        var colorscheme;
        self.patterninput;

        //self.datainput = ko.observable();
        self.editColorVisible = ko.observable(false);
        self.color = { 
          red: ko.observable(0),
          green: ko.observable(0),
          blue: ko.observable(255),
          white: ko.observable(0),
          pattern: ko.observable(1)
        };
        self.patternOptions = ko.observableArray( [
          {id: 0, name: 'Constant'},
          {id: 1, name: 'Fast Pulsing'},
          {id: 2, name: 'Normal Pulsing'},
          {id: 3, name: 'Slow Pulsing'}
        ]);

        self.selectedOption = ko.observable(self.patternOptions().id);
          


        self.editSettings = function(name) {
          url = OctoPrint.getBlueprintUrl('rgbstatus') + 'getcolor/' + name;
          OctoPrint.get(url).done(function (result){
            patterninput = result.color;
            self.color.pattern = result.pattern;
            self.selectedOption(self.color.pattern);
            self.color.red(parseInt(patterninput.substring(1,3),16));
            self.color.green(parseInt(patterninput.substring(3,5),16));
            self.color.blue(parseInt(patterninput.substring(5,7),16));
            self.color.white(parseInt(patterninput.substring(7,9),16));
            if (patterninput.length <=8){
                self.color.white("00");
            };
            
          });
          self.editColorVisible(true);  
          self.profilename = name;
          
        };

        self.getDefault = function(){
          url = OctoPrint.getBlueprintUrl('rgbstatus') + 'getdefault/' + self.profilename;
          OctoPrint.get(url).done(function (result){
            patterninput = result.color;
            self.color.pattern = result.pattern;
            self.selectedOption(self.color.pattern);
            self.color.red(parseInt(patterninput.substring(1,3),16));
            self.color.green(parseInt(patterninput.substring(3,5),16));
            self.color.blue(parseInt(patterninput.substring(5,7),16));
            self.color.white(parseInt(patterninput.substring(7,9),16));
            if (patterninput.length <=8){
                self.color.white("00");
            };
          });
        };


        self.saveSettings = function(){
          url = OctoPrint.getBlueprintUrl('rgbstatus') + 'setcolor/' + self.profilename + '/';
          url = getSettingsUrl(url);
          $.notify({
            title: gettext("Settings Saved"),
            text: _.sprintf(gettext('The settings for %(name)s color is saved'),{"name": self.profilename})},
          "success"); q
          OctoPrint.get(url).done();
          self.editColorVisible(false);
        };
        
        self.previewSettings = function(){
          url = OctoPrint.getBlueprintUrl('rgbstatus') + 'preview/';
          url = getSettingsUrl(url);
          OctoPrint.get(url).done();
        };
        
        self.allDefaultSettings = function(){

            var text = gettext("You are about to bring all colors to their default settings.");
            var question = gettext("Do you want to continue?");
            var title = gettext("RGB color reset");
            var dialog = {'title': title, 'text': text, 'question' : question};

            self.flyout.showConfirmationFlyout(dialog, true)
                .done(function () {
                    $.notify({
                      title: gettext("Settings Set back to default"),
                      text: _.sprintf(gettext('All settings are back to default'))},
                    "success");
                    url = OctoPrint.getBlueprintUrl('rgbstatus') + "setdefault/all";
                    OctoPrint.get(url).done();
                });
        };

        self.back = function() {
          self.editColorVisible(false);
        };

        function getSettingsUrl(url){
          red = self.color.red();
          green = self.color.green();
          blue = self.color.blue();
          white = self.color.white();
          colorinput = toHex(red) + toHex(green) + toHex(blue) + toHex(white);
          patterninput = self.selectedOption();
          url = url + colorinput + '/' + patterninput;
          return url;
        };

        function toHex(number) {
          var s = (+number).toString(16);
          if(s.length < 2) {
              s = '0' + s;
          }
          s = s.toUpperCase();
          return s;
       };

    }



    ADDITIONAL_VIEWMODELS.push([
        RgbViewModel,
        ["flyoutViewModel", "introViewModel", "loginStateViewModel", "printerStateViewModel"],
        ["#rgb_lighting_settings_flyout_content"]
    ]);
});
