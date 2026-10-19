// NativeWind v4: preset do Expo com jsxImportSource + preset do NativeWind.
// O babel-preset-expo já inclui o plugin do Reanimated/Worklets quando instalado.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
