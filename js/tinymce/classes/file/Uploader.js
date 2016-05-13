/**
 * Uploader.js
 *
 * Released under LGPL License.
 * Copyright (c) 1999-2015 Ephox Corp. All rights reserved
 *
 * License: http://www.tinymce.com/license
 * Contributing: http://www.tinymce.com/contributing
 */

/**
 * Upload blobs or blob infos to the specified URL or handler.
 *
 * @private
 * @class tinymce.file.Uploader
 * @example
 * var uploader = new Uploader({
 *     url: '/upload.php',
 *     basePath: '/base/path',
 *     credentials: true,
 *     handler: function(data, success, failure) {
 *         ...
 *     }
 * });
 *
 * uploader.upload(blobInfos).then(function(result) {
 *     ...
 * });
 */
define("tinymce/file/Uploader", [
	"tinymce/util/Promise",
	"tinymce/util/Tools",
	"tinymce/util/Fun"
], function(Promise, Tools, Fun) {
	return function(uploadStatus, settings) {
		function fileName(blobInfo) {
			var ext, extensions;

			extensions = {
				'image/jpeg': 'jpg',
				'image/jpg': 'jpg',
				'image/gif': 'gif',
				'image/png': 'png'
			};

			ext = extensions[blobInfo.blob().type.toLowerCase()] || 'dat';

			return blobInfo.id() + '.' + ext;
		}

		function pathJoin(path1, path2) {
			if (path1) {
				return path1.replace(/\/$/, '') + '/' + path2.replace(/^\//, '');
			}

			return path2;
		}

		function blobInfoToData(blobInfo) {
			return {
				id: blobInfo.id,
				blob: blobInfo.blob,
				base64: blobInfo.base64,
				filename: Fun.constant(fileName(blobInfo))
			};
		}

		function defaultHandler(blobInfo, success, failure, progress) {
			var xhr, formData;

			xhr = new XMLHttpRequest();
			xhr.open('POST', settings.url);
			xhr.withCredentials = settings.credentials;

			xhr.upload.onprogress = function(e) {
				progress(e.loaded / e.total * 100);
			};

			xhr.onerror = function() {
				failure("Image upload failed due to a XHR Transport error. Code: " + xhr.status);
			};

			xhr.onload = function() {
				var json;

				if (xhr.status != 200) {
					failure("HTTP Error: " + xhr.status);
					return;
				}

				json = JSON.parse(xhr.responseText);

				if (!json || typeof json.location != "string") {
					failure("Invalid JSON: " + xhr.responseText);
					return;
				}

				success(pathJoin(settings.basePath, json.location));
			};

			formData = new FormData();
			formData.append('file', blobInfo.blob(), fileName(blobInfo));

			xhr.send(formData);
		}

		function noUpload() {
			return new Promise(function(resolve) {
				resolve([]);
			});
		}

		function handlerSuccess(blobInfo, url) {
			return {
				url: url,
				blobInfo: blobInfo,
				status: true
			};
		}

		function handlerFailure(blobInfo, error) {
			return {
				url: '',
				blobInfo: blobInfo,
				status: false,
				error: error
			};
		}

		function uploadBlobInfo(blobInfo, handler, openNotification) {
			return new Promise(function(resolve) {
				var notification, progress;

				var noop = function() {
				};

				try {
					var closeNotification = function() {
						if (notification) {
							notification.close();
							progress = noop; // Once it's closed it's closed
						}
					};

					var success = function(url) {
						closeNotification();
						uploadStatus.markUploaded(blobInfo.blobUri(), url);
						resolve(handlerSuccess(blobInfo, url));
					};

					var failure = function() {
						closeNotification();
						resolve(handlerFailure(blobInfo, failure));
					};

					progress = function(percent) {
						if (percent < 0 || percent > 100) {
							return;
						}

						if (!notification) {
							notification = openNotification();
						}

						notification.progressBar.value(percent);
					};

					handler(blobInfoToData(blobInfo), success, failure, progress);
				} catch (ex) {
					resolve(handlerFailure(blobInfo, ex.message));
				}
			});
		}

		function isDefaultHandler(handler) {
			return handler === defaultHandler;
		}

		function uploadBlobs(blobInfos, openNotification) {
			blobInfos = Tools.grep(blobInfos, function(blobInfo) {
				return !uploadStatus.hasBlobUri(blobInfo.blobUri());
			});

			Tools.each(blobInfos, function(blobInfo) {
				return uploadStatus.markPending(blobInfo.blobUri());
			});

			return Promise.all(Tools.map(blobInfos, function(blobInfo) {
				return uploadBlobInfo(blobInfo, settings.handler, openNotification);
			}));
		}

		function upload(blobInfos, openNotification) {
			return (!settings.url && isDefaultHandler(settings.handler)) ? noUpload() : uploadBlobs(blobInfos, openNotification);
		}

		settings = Tools.extend({
			credentials: false,
			// We are adding a notify argument to this (at the moment, until it doesn't work)
			handler: defaultHandler
		}, settings);

		return {
			upload: upload
		};
	};
});