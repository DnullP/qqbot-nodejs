import type { InlineKeyboard } from "./types.js";
/** Official botgo DTO fields; account/client support remains unverified. */
export interface OfficialMessageFields {
  content?: string;
  msg_type?: number;
  markdown?: {content?: string; custom_template_id?: string; params?: Array<{key:string; values:string[]}>};
  keyboard?: InlineKeyboard | {id:string};
  prompt_keyboard?: {keyboard?: InlineKeyboard | {id:string}};
  action_button?: {template_id?:number; callback_data?:string; feedback?:boolean; tts?:boolean; re_generate?:boolean; stop_generate?:boolean};
  subscribe_id?: string;
  feature_id?: number;
  stream?: {state:1 | 10 | 11 | 20; id?:string; index:number; reset?:boolean};
  media?: {file_info:string};
}
