import type { StorybookConfig } from "@storybook/react-vite";
import { STORYBOOK_BUILD_TARGET } from "./constants";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@storybook/addon-essentials",
    "@storybook/addon-interactions",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  staticDirs: ["../src/public"],
  viteFinal: async (viteConfig) => ({
    ...viteConfig,
    build: {
      ...viteConfig.build,
      target: STORYBOOK_BUILD_TARGET,
    },
  }),
};

export default config;
