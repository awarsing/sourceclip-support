export const WIDGET_LAUNCHER_ALIGNMENTS = ['right', 'left'] as const
export type WidgetLauncherAlignment = (typeof WIDGET_LAUNCHER_ALIGNMENTS)[number]

// fallow-ignore-next-line unused-export -- imported by app/pages/dashboard/settings/widget.vue through the #layers/feedlog alias, which Fallow does not resolve in Vue SFCs
export const WIDGET_LAUNCHER_ALIGNMENT_DEFAULT: WidgetLauncherAlignment = 'right'
// fallow-ignore-next-line unused-export -- imported by app/pages/dashboard/settings/widget.vue and WidgetLauncherPreview.vue through the #layers/feedlog alias, which Fallow does not resolve in Vue SFCs
export const WIDGET_LAUNCHER_OFFSET_DEFAULT = 20
export const WIDGET_LAUNCHER_OFFSET_MIN = 0

export const WIDGET_LAUNCHER_CLOSE_BEHAVIORS = ['none', 'collapse', 'hide'] as const
export type WidgetLauncherCloseBehavior = (typeof WIDGET_LAUNCHER_CLOSE_BEHAVIORS)[number]
// fallow-ignore-next-line unused-export -- imported by app/pages/dashboard/settings/widget.vue through the #layers/feedlog alias, which Fallow does not resolve in Vue SFCs
export const WIDGET_LAUNCHER_CLOSE_BEHAVIOR_DEFAULT: WidgetLauncherCloseBehavior = 'collapse'

export interface WidgetLauncherConfig {
  alignment: WidgetLauncherAlignment
  bottomOffset: number
  sideOffset: number
  closeBehavior: WidgetLauncherCloseBehavior
}

export const WIDGET_LAUNCHER_CONFIG_DEFAULT: WidgetLauncherConfig = {
  alignment: WIDGET_LAUNCHER_ALIGNMENT_DEFAULT,
  bottomOffset: WIDGET_LAUNCHER_OFFSET_DEFAULT,
  sideOffset: WIDGET_LAUNCHER_OFFSET_DEFAULT,
  closeBehavior: WIDGET_LAUNCHER_CLOSE_BEHAVIOR_DEFAULT,
}
