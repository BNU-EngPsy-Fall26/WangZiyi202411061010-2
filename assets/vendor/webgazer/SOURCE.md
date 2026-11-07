# WebGazer 3.5.3

Browser distribution and MediaPipe Face Mesh assets from the [WebGazer 3.5.3 npm package](https://registry.npmjs.org/webgazer/-/webgazer-3.5.3.tgz). Upstream source and build instructions: [Brown HCI WebGazer](https://github.com/brownhci/WebGazer).

WebGazer is GPL-3.0-or-later. Included MediaPipe files retain upstream license metadata. Model binaries are unchanged.

Local compatibility changes in webgazer.js:

- The camera warning checks the browser's isSecureContext value, including secure local-file pages.
- MediaPipe's locateFile callback accepts URLs from NorthlineEyeAssets for local-file loading.

The generated eye-assets.js contains Base64 copies of the original MediaPipe files, served as typed Blob URLs when index.html is opened directly. Regenerate with node tools/build-eye-assets.cjs. HTTPS and localhost continue loading the original files normally.
