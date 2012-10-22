/*
 * gallery-viewer
 * https://github.com/bgcom/gallery-viewer
 *
 * Copyright (c) 2012 BGcom
 * Licensed under the MIT license.
 */

;(function ( $, Handlebars, History, window, document, undefined ) {
    var _defaultTemplate = "";
    var that = {};
    $.widget( "bgcom.galleryViewer" , {
        version: "1.0",
        data: {},
        _handlers: {},
        nbElem: 0,
        _indexes: [],
        _curIdx: NaN,
        options: {
            template: _defaultTemplate,
            someValue: null,
            zoomFactor: 1.2,
            selectors: {
                'thumbList': ".galleryViewer-ThumbnailList", // Where are the thumbnails
                'thumbElement': ".galleryViewer-ThumbnailContainer", // What contains the thumbnail
                'thumbLink': ".galleryViewer-ThumbnailLink", // Where is the data and what will make the slideshow open
                button: {
                    next: ".galleryViewer-next",
                    previous: ".galleryViewer-previous",
                    zoomIn: ".galleryViewer-zoomIn",
                    zoomOut: ".galleryViewer-zoomOut",
                    close: ".galleryViewer-close"
                },
                'main': ".galleryViewer-main",
                'mainContainer': ".galleryViewer-main-container",
                'photoContainer': ".galleryViewer-photo-container",
                'sideContainer': ".galleryViewer-side-container" // the sidebar if you have one
            }
        },

        /** Change the image currently displayed according to the data attached to the event
         * triggers imageChanged
         * data.type === 'next' we go to the next image
         * data.type === 'previous' we go to the previous image
         * data.type === 'none' we clicked on an image
         * The image go in circle (If we arrive to the last one we go to the first one)
         */
        changeImage: function(e) {
            var idx = 0;
            switch (e.data.type) {
                case 'previous':
                    idx = (that._curIdx === 0) ?
                           that._indexes.length - 1 :
                           that._curIdx - 1;
                    break;
                case 'next':
                    idx = (that._curIdx === that._indexes.length - 1) ?
                            0 : that._curIdx + 1;
                    break;
                case 'none':
                    idx = that.data[$(e.currentTarget).attr('key')].index - 1;
                    break;
            }
            // We change the current link that will trigger the rerender of the slideshow
            // The random number is to ensure that the object is unique
            var hash = that._indexes[idx];
            History.pushState({"state": hash, "rand": Math.random()},
                              that._getTitle(hash), hash);
            that._trigger('imageChanged', e);
        },

        /**
         * Close the window and triggers viewerClosed
         */
        close : function(e) {
            // We go to the root url
            that._goRootUrl();

            //We adapt the style concequently
            that.element.html("");
            $('html').css("overflow", "auto");
            $('body').off("keydown.galleryViewer", that._handler.keyboard);
            that._trigger('viewerClosed', e);
        },

        /**
         * Zoom on the image according to the option.zoomFactor and the event data
         * triggers zoom
         * data.type === 'in' zoom in
         * data.type === 'out' zoom out
         */
        zoom: function (e) {
            var $img = $("img", that.options.selectors.photoContainer);
            var width = $img.width();
            var height = $img.height();
            var factor = 0;
            if (e.data.type === 'in') {
                factor = that.options.zoomFactor;
            } else if (e.data.type === 'out') {
                factor = 1.0 / that.options.zoomFactor;
            }

            $img.width(width * factor);
            $img.height(height * factor);
        },

        /**
         * Destroy an instantiated plugin and clean up
         * modifications the widget has made to the DOM
         */
        destroy: function () {
            that.close();

            that._unbindAll();

            $.Widget.prototype.destroy.call(this);
            // For UI 1.9, define _destroy instead and don't
            // worry about
            // calling the base widget
        },

        /**
         * Unbinds all events so that the viewer will never open
         */
        suspend: function () {
            that._unbindAll();
        },

        /**
         * Binds the event and reread the current DOM to get new elements or a change in the order
         */
        restart: function () {
            that.data = {};
            that.nbElem = 0;
            that._indexes = [];
            that._curIdx = NaN;
            $(that.options.selectors.thumbLink, that.options.selectors.thumbList)
                .each(that._appendElement);
            // We bind every thumbnail to opening the viewer
            $(that.options.selectors.thumbLink, that.options.selectors.thumbList)
                .on("click.galleryViewer",
                      {type: 'none'}, that._handler.openViewer);
        },

        /**
         * Initialize the widget and bind all the events
         */
        _create: function () {
            that = this;
            // Create all the event handlers and store them in an object to be able to unbind easily
            that._initWidget();
            that._bindAll();
        },

        /**
         * We bind all events
         */
        _bindAll: function () {
            // We bind History.js
            // Everytime the url changes we change image
            History.Adapter.bind(window, 'statechange', function() {
                that._changeImageFromUrl();
            });
            // We bind every thumbnail to opening the viewer
            $(that.options.selectors.thumbLink, that.options.selectors.thumbList)
                .on("click.galleryViewer",
                      {type: 'none'}, that._handler.openViewer);
        },

        _unbindAll: function () {
            $(that.options.selectors.thumbLink, that.options.selectors.thumbList)
                .off("click.galleryViewer");
        },

        /**
         * Compiles the Template and extracts all the data from the thumbnails
         * NOTICE: _init is used by jQuery-ui widget factory and I'm not sur that this could go in it
         */
        _initWidget: function () {
            that.template = Handlebars.compile(that.options.template);
            // Extract the data from the thumbnails
            $(that.options.selectors.thumbLink, that.options.selectors.thumbList)
                .each(that._appendElement);
            // In case there's already an anchor for an image when loading the page
            that._changeImageFromUrl();
        },

        _appendElement: function (idx, elt) {
            var key = $(elt).attr('key');
            var data = $.parseJSON($(elt).attr('data'));
            that._indexes[idx] = key;

            that.data[key] = data;
            // Description can be rich text so we don't escape
            that.data[key].description =
                new Handlebars.SafeString(data.description);
            // If we want to display number from 1 rather than from 0
            that.data[key].index = idx + 1;
            //This preloads the images and will be reused for resizing
            that.data[key].imageObj = new Image();
            that.data[key].imageObj.src = that.data[key].src;
        },

        /**
         * If a hash is defined in the url we show the right Image
         * TODO: deal with the loading to make it nicer
         */
        _changeImageFromUrl: function() {
            var path = window.location.pathname.split('/');
            var data = path[path.length - 1];
            if (typeof(that.data[data]) !== "undefined") {
                that._displayImage(data);
                that.data[data].imageObj.onload = function(e) {
                    that._sizeImage();
                };
            } else if (typeof(that.data[data]) === "undefined" && data !== "") {
                that._goRootUrl();
            }
        },

        /**
         * Make us go to the root url (in case the image doesn't exist or we close the gallery)
         */
        _goRootUrl: function () {
            var locationTab = location.href.split('/');
            locationTab.pop();
            var root = locationTab.join('/');
            // We push in our history the root
            History.pushState({"state": root, "rand": Math.random()},
                              that._getTitle(), root + '/');
        },

        /**
         * Renders the box and binds all the events to it
         * @param idx string the index(key or hash) of the photo
         */
        _displayImage : function(idx) {
            that._curIdx = that.data[idx].index - 1;
            // We renew keyboard binding to be sure not to bind twice
            $('body').off("keydown.galleryViewer", that._handler.keyboard);
            $('body').on("keydown.galleryViewer", that._handler.keyboard);
            // Render the box
            that._render(idx);

            // Bond all the buttons
            $(that.options.selectors.button.next, that.element)
                .on("click.galleryViewer",
                      {type: 'next'}, that._handler.changeImage);
            $(that.options.selectors.button.previous, that.element)
                .on("click.galleryViewer",
                      {type: 'previous'}, that._handler.changeImage);
            $(that.options.selectors.button.close, that.element)
                .one("click.galleryViewer", that._handler.close);

            $(that.options.selectors.button.zoomIn, that.element)
                .on("click.galleryViewer", {type: "in"}, that._handler.zoom);
            $(that.options.selectors.button.zoomOut, that.element)
                .on("click.galleryViewer", {type: "out"}, that._handler.zoom);

            $(that.options.selectors.mainContainer).on("click.galleryViewer", function (e) {
                e.stopPropagation();
            });

            $(that.options.selectors.main).one("click.galleryViewer", that._handler.close);

            $(window).on("resize.galleryViewer", that._handler.resize);
            that.element.focus();
        },

        /**
         * Renders the box and trigger imageDisplayed
         */
        _render : function(id) {
            $('html').css("overflow-x", "hidden");
            $('html').css("overflow-y", "hidden");
            var element = that.data[id];
            // To get rich text description
            that.element.html(that.template({
                elem: element,
                totalElements: that._indexes.length
            }));
            $('img', that.element).draggable({});
            that._trigger('imageDisplayed');
            that._resize();
        },

        /**
         * Resize the image according to the window size
         */
        _resize: function () {
            var selectors = that.options.selectors;
            var $main = $(selectors.main);
            // Fix the size of the main box
            $main.height($(window).height());
            $main.width($(window).width());

            // Fix the size of the photo container according to what is left from the sideContainer
            $(selectors.photoContainer)
                    .width($main.width() - $(selectors.sideContainer).outerWidth(true));
            // This is because the image is the stick to the top left corner of our document and it height
            // is the size of the window so to be sure to make it everywhere we just stick it to the top
            window.scrollTo(0, 0);

            that._sizeImage();
        },

        /**
         * Sets the inside img element to the right size respecting proportions
         */
        _sizeImage: function () {
            var $container = $(that.options.selectors.photoContainer, that.element);
            var $img = $("img", $container);
            var curImg = that.data[that._indexes[that._curIdx]].imageObj;
            // We get the proportions of the image compared to its container
            var dif = { height: $container.height() / curImg.height,
                        width: $container.width() / curImg.width};
            // We obtain the scaling factor
            var factor;
            if (dif.width < 1 && dif.height < 1) {
                // both side overflow from the container
                factor = Math.min(dif.width, dif.height);
            } else if (dif.width > 1 && dif.height > 1) {
                // both side are too small for the container
                factor = Math.max(dif.width, dif.height);
            } else if (dif.width < 1) {
                // only the width is too big
                factor = dif.width;
            } else if (dif.height < 1) {
                // only the height is too big
                factor = dif.height;
            }
            // Set the final size of the image
            $img.width(curImg.width * factor);
            $img.height(curImg.height * factor);
        },

        /**
         * Creates the title for the page of the photo
         */
        _getTitle: function(idx) {
            var title = document.title.split('|');
            if (typeof(idx) === "undefined" && title.length > 3) {
                title.splice(0,1);
            } else if (typeof(that.data[idx]) !== "undefined") {
                title[0] = ' ' + title[0];
                if (title.length > 3) {
                    title.splice(0,1, that.data[idx].title + " ");
                } else {
                    title = [that.data[idx].title + " "].concat(title);
                }
            } else if (typeof(idx) !== "undefined" && typeof(that.data[idx]) === "undefined") {
                title.splice(0,1);
                title[0] = title[0].substr(1);
            }
            return title.join('|');
        },

        /**
         * Respond to any changes the user makes to the
         * DUMMY method for the moment
         */
        _setOption: function ( key, value ) {
            /*switch (key) {
                case "someValue":
                    //this.options.someValue = doSomethingWith( value );
                    break;
                default:
                    //this.options[ key ] = value;
                    break;
            }

            // For UI 1.8, _setOption must be manually invoked
            // from the base widget
            $.Widget.prototype._setOption.apply( this, arguments );
            // For UI 1.9 the _super method can be used instead
            // this._super( "_setOption", key, value );
            */
        },
        /**
         * All the handlers of our events
         */
        _handler: {
            openViewer: function(e) {
                e.preventDefault();
                that.changeImage(e);
                that._trigger('viewerOpened');
            },
            changeImage: function(e) {
                e.preventDefault();
                that.changeImage(e);
            },
            keyboard: function(e) {
                switch (e.keyCode ? e.keyCode : e.which) {
                    case 37: // left arrow
                        e.preventDefault();
                        e.data = {'type': 'previous'};
                        that.changeImage(e);
                        break;
                    case 39: // right arrow
                        e.preventDefault();
                        e.data = {'type' : 'next'};
                        that.changeImage(e);
                        break;
                    case 27: // left esc
                        e.preventDefault();
                        that.close(e);
                        break;
                    case 38: // up arrow
                        e.preventDefault();
                        e.data = { type: 'in'};
                        that.zoom(e);
                        break;
                    case 40: // down arrow
                        e.preventDefault();
                        e.data = { type: 'out'};
                        that.zoom(e);
                        break;
                }
            },
            zoom: function (e) {
                that.zoom(e);
            },
            resize: function(e) {
                that._resize();
            },
            close: function(e) {
                that.close(e);
            }
        }
    });

})( jQuery, Handlebars, History, window, document );
