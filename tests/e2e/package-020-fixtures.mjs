let config={packages:["amsmath","amssymb","tikz","asymptote","booktabs"],preamble:"",libraries:[]};
export function fixture020(op,args,actor){
 if(!["latex_settings_read","latex_settings_save"].includes(op))return null;
 if(!actor||actor.account_status!=="active"||(op==="latex_settings_save"&&actor.role!=="admin"))return {value:{code:"42501"},status:403};
 if(op==="latex_settings_save")config=structuredClone(args.p_config);
 return {value:config,status:200};
}
