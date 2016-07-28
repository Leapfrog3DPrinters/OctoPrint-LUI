$(function() {
  function FlyoutViewModel(parameters) {
    var self = this;
    
    self.deferred = undefined;
    self.confirmationDeferred = undefined;

    self.template_flyout = undefined;

    self.blocking = false;
    self.flyoutName = "";

    self.confirmation_title = ko.observable(undefined);
    self.confirmation_text = ko.observable(undefined);
    self.confirmation_question = ko.observable(undefined);
    self.confirmation_ok_text = ko.observable(undefined);
    self.confirmation_cancel_text = ko.observable(undefined);
    
    self.warnings = ko.observableArray([]);
    self.infos = ko.observableArray([]);

    self.isOpen = function()
    {
        return $('.overlay').hasClass('active');
    }

    self.showWarning = function(title, message, blocking, callback)
    {
        var blocking = blocking || false;
        var callback = callback || function () { };
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
        var callback = callback || function () { };

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

    self.closeLastInfo = function () {
        self.infos.pop();
        self.setOverlay();
    }

    self.showFlyout = function(flyout, blocking) {
      self.deferred = $.Deferred();
      self.blocking = blocking || false;
      
      self.flyoutName = flyout;

      self.template_flyout = '#'+flyout+'_flyout';
      self.activateFlyout();

      // Call viewmodels with the flyout method on{FlyoutTopic}Shown
      var method = "on" + capitalize(flyout) + "FlyoutShown";
      callViewModels(self.allViewModels, method);

      return self.deferred;
    };
    
    self.showConfirmationFlyout = function(data, leaveFlyout) {
      // Set flyout ko.observables
      var title = data.title || "Are you sure?";
      var text = data.text || "";
      var question = data.question || "Are you sure want to proceed?";
      var ok_text = data.ok_text || "Confirm";
      var cancel_text = data.cancel_text || "Cancel";

      self.confirmation_title(title);
      self.confirmation_text(text);
      self.confirmation_question(question);
      self.confirmation_ok_text(ok_text);
      self.confirmation_cancel_text(cancel_text);

      // Show the confirmation flyout
      $('#confirmation_flyout').addClass('active');
      self.setOverlay();

      self.confirmationDeferred = $.Deferred()
          .done(function () {
              $('#confirmation_flyout').removeClass('active');
              self.setOverlay();

              if (self.deferred !== undefined && !leaveFlyout)
                  self.closeFlyoutAccept();
          
              self.confirmationDeferred = undefined;
              
          })
          .fail(function () {
              $('#confirmation_flyout').removeClass('active');
              self.setOverlay();

              self.confirmationDeferred = undefined;
          });

      return self.confirmationDeferred;
    };

    self.closeFlyout = function() {
        self.deactivateFlyout();
        if (self.deferred != undefined) {
            self.deferred.reject();
            self.deferred = undefined;
        }
    };
    
    self.closeFlyoutAccept = function() {
        self.deactivateFlyout();
        if (self.deferred != undefined) {
            self.deferred.resolve();
            self.deferred = undefined;
        }
    };

    self.activateFlyout = function()
    {
        $(self.template_flyout).addClass('active');
        self.setOverlay();
    }

    self.deactivateFlyout = function () {
        $(self.template_flyout).removeClass('active');
        self.setOverlay();
    }

    self.setOverlay = function () {
        if (self.warnings().length == 0 && self.infos().length == 0 &&
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
