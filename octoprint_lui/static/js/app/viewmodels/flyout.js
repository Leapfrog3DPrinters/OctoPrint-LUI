$(function () {
  function FlyoutViewModel(parameters) {
    var self = this;
    
    self.confirmationDeferred = undefined;

    self.template_flyout = undefined;

    self.blocking = false;
    self.currentFlyoutTemplate = "";

    self.confirmation_title = ko.observable(undefined);
    self.confirmation_text = ko.observable(undefined);
    self.confirmation_question = ko.observable(undefined);
    self.confirmation_ok_text = ko.observable(undefined);
    self.confirmation_cancel_text = ko.observable(undefined);
    
    self.warnings = ko.observableArray([]);
    self.infos = ko.observableArray([]);
    self.flyouts = ko.observableArray([]);

    self.isOpen = function()
    {
        return $('.overlay').hasClass('active');
    }

    self.showWarning = function(title, message, blocking, callback)
    {
        var blocking = blocking || false;
        var callback = callback || function ()  { };
        warningVm = {
            warning_title: title,
            warning_text: message,
            blocking: blocking,
            callback: callback
        };

        self.warnings.push(warningVm);
        self.setOverlay();

        return warningVm;
    }

    self.closeWarning = function(warningVm)
    {
        self.warnings.remove(warningVm);
        self.setOverlay();
    };

    self.closeLastWarning = function()
    {
        self.warnings.pop();
        self.setOverlay();
    }

    self.showInfo = function (title, message, blocking, callback) {
        var blocking = blocking || false;
        var callback = callback || function ()  { };

        infoVm = {
            info_title: title,
            info_text: message,
            blocking: blocking,
            callback: callback
        };

        self.infos.push(infoVm);
        self.setOverlay();

        return infoVm;
    }

    self.closeInfo = function (infoVm) {
        self.infos.remove(infoVm);
        self.setOverlay();
    };

    self.closeLastInfo = function ()  {
        self.infos.pop();
        self.setOverlay();
    }

    self.showFlyout = function (flyout, blocking, high_priority) {

//TODO: Check if flyout open. If so, push to front and return its deferred

      var deferred = $.Deferred();
      var template_flyout = '#'+flyout+'_flyout';
      var blocking = blocking || false;
      self.blocking = blocking;
      self.flyouts.push({deferred: deferred, template: template_flyout, blocking: blocking});
      self.currentFlyoutTemplate = template_flyout;

      self.activateFlyout(template_flyout, high_priority);

      // Call viewmodels with the flyout method on{FlyoutTopic}Shown
      var method = "on" + capitalize(flyout) + "FlyoutShown";
      callViewModels(self.allViewModels, method);

      return self.flyouts()[self.flyouts().length - 1].deferred
    };
    
    self.showConfirmationFlyout = function(data, leaveFlyout) {
      // Set flyout ko.observables
      var title = data.title || gettext("Are you sure?");
      var text = data.text || "";
      var question = data.question || gettext("Are you sure want to proceed?");
      var ok_text = data.ok_text || gettext("Confirm");
      var cancel_text = data.cancel_text || gettext("Cancel");

      self.confirmation_title(title);
      self.confirmation_text(text);
      self.confirmation_question(question);
      self.confirmation_ok_text(ok_text);
      self.confirmation_cancel_text(cancel_text);

      // Show the confirmation flyout
      $('#confirmation_flyout').addClass('active');
      $('#confirmation_flyout').css("z-index", self.flyouts().length + 1);
      self.setOverlay();

      self.confirmationDeferred = $.Deferred()
          .done(function ()  {
              $('#confirmation_flyout').removeClass('active');
              self.setOverlay();

              if (self.flyouts().length !== 0 && !leaveFlyout)
                  self.closeFlyoutAccept();
          
              self.confirmationDeferred = undefined;
              
          })
          .fail(function ()  {
              $('#confirmation_flyout').removeClass('active');
              self.setOverlay();

              self.confirmationDeferred = undefined;
          });

      return self.confirmationDeferred;
    };

    self.isFlyoutOpen = function (flyout)
    {
        var template_flyout = '#' + flyout + '_flyout';
        return _.some(self.flyouts(), function (f) { return f.template == template_flyout });
    }

    self.closeFlyout = function (flyout) {

        if (flyout !== undefined)
        {
            var template_flyout = '#' + flyout + '_flyout';
            var flyout_ref = _.find(self.flyouts(), function (f) { return f.template == template_flyout });

            if (!flyout_ref)
                return;

            self.flyouts.remove(flyout_ref);
        }
        else
        {
            var flyout_ref = self.flyouts.pop();
            var template_flyout = flyout_ref.template;
        }

        var deferred = flyout_ref.deferred;
        
        if (deferred != undefined) {
            deferred.reject();
            if (self.flyouts().length > 0){
                self.currentFlyoutTemplate = self.flyouts()[self.flyouts().length - 1].template;
                self.blocking = self.flyouts()[self.flyouts().length - 1].blocking;
              } else {
                self.blocking = false;
              }
        }
        self.deactivateFlyout(template_flyout);
    };
    
    self.closeFlyoutAccept = function (flyout) {
        if (flyout !== undefined)
        {
            var template_flyout = '#' + flyout + '_flyout';
            var flyout_ref = _.find(self.flyouts(), function (f) { return f.template == template_flyout });

            if (!flyout_ref)
                return;

            self.flyouts.remove(flyout_ref);
        }
        else
        {
            var flyout_ref = self.flyouts.pop();
            var template_flyout = flyout_ref.template;
        }

        var deferred = flyout_ref.deferred;
        
        if (deferred != undefined) {
            deferred.resolve();
            if (self.flyouts().length > 0){
                self.currentFlyoutTemplate = self.flyouts()[self.flyouts().length - 1].template;
                self.blocking = self.flyouts()[self.flyouts().length - 1].blocking;
            } else {
              self.blocking = false;
            }
        }
        self.deactivateFlyout(template_flyout);
    };

    self.activateFlyout = function (template_flyout, high_priority) {
        $(template_flyout).addClass('active');

        if (high_priority) // Z-index them on top of other flyouts, but below warnings and confirmations
            $(template_flyout).css("z-index", 50 + self.flyouts().length);
        else
            $(template_flyout).css("z-index", self.flyouts().length);

        self.setOverlay();
    }

    self.deactivateFlyout = function (template_flyout) {
        $(template_flyout).removeClass('active');
        self.setOverlay();
    }

    self.setOverlay = function () {
        var flyouts = self.flyouts();
        if (self.warnings().length == 0 && self.infos().length == 0 && self.flyouts().length == 0 &&
            !$('#confirmation_flyout').hasClass('active') && !$(self.template_flyout).hasClass('active'))
            $('.overlay').removeClass('active');
        else
            $('.overlay').addClass('active');
    }

    self.onAllBound = function(allViewModels) {
        self.allViewModels = allViewModels;
    };
  }

  OCTOPRINT_VIEWMODELS.push([
    FlyoutViewModel,
    [],
    ['#confirmation_flyout', '#warnings_container', '#infos_container'],
  ]);

});
