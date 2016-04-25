$(function() {
  function FlyoutViewModel(parameters) {
    var self = this;
    
    self.deferred = undefined;
    self.template_flyout = undefined;
    
    self.showFlyout = function(flyout) {
      self.deferred = $.Deferred();

      self.template_flyout = '#'+flyout+'_flyout';
      var $toggle_flyout = $(self.template_flyout),
          $overlay = $('.overlay');
      $toggle_flyout.addClass('active');
      $overlay.addClass('active');

      // Call viewmodels with the flyout method on{FlyoutTopic}Shown

      var method = "on" + capitalize(flyout) + "FlyoutShown";
      callViewModels(self.allViewModels, method);

      return self.deferred;
    };
    
    self.closeFlyout = function() {
      var $toggle_flyout = $(self.template_flyout),
          $overlay = $('.overlay');
      $toggle_flyout.removeClass('active');
      $overlay.removeClass('active');
      
      self.deferred.reject();
    };
    
    self.closeFlyoutWithButton = function() {
      var $toggle_flyout = $(self.template_flyout),
          $overlay = $('.overlay');
      $toggle_flyout.removeClass('active');
      $overlay.removeClass('active');
      
      self.deferred.resolve();
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