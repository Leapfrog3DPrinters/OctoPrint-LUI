$(function() {
  function FlyoutViewModel(parameters) {
    var self = this;
    
    self.deferred = undefined;
    self.template_flyout = undefined;

    self.confirmation_title = ko.observable(undefined);
    self.confirmation_text = ko.observable(undefined);
    self.confirmation_question = ko.observable(undefined);
    
    self.showFlyout = function(flyout) {
      self.deferred = $.Deferred();

      self.template_flyout = '#'+flyout+'_flyout';
      var $toggle_flyout = $(self.template_flyout),
          $overlay = $('.overlay');
      $toggle_flyout.toggleClass('active');
      $overlay.toggleClass('active');

      // Call viewmodels with the flyout method on{FlyoutTopic}Shown

      var method = "on" + capitalize(flyout) + "FlyoutShown";
      callViewModels(self.allViewModels, method);

      return self.deferred;
    };
    
    self.showConfirmationFlyout = function(title, text, question) {
      // 

      title = title || "Are you sure?";
      text = text || "";
      question = question || "Are you sure want to proceed?";


    };

    self.closeFlyout = function() {
      self.toggleFlyout();     
      self.deferred.reject();
    };
    
    self.closeFlyoutAccept = function() {
      self.toggleFlyout();
      self.deferred.resolve();
    };

    self.toggleFlyout = function() {
      var $toggle_flyout = $(self.template_flyout),
          $overlay = $('.overlay');
      $toggle_flyout.toggleClass('active');
      $overlay.toggleClass('active');
    };

    self.onAllBound = function(allViewModels) {
        self.allViewModels = allViewModels;
    };
  }

  OCTOPRINT_VIEWMODELS.push([
    FlyoutViewModel,
    [],
    []
  ]);

});