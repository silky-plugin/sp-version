const _fs = require('fs');
const _path = require('path');
const _exec = require('child_process').exec;

let _version = ""
const getSetting = (options)=>{
  let setting = {}
  if(null == options.css){
    setting.css = true;
  }else{
    setting.css = options.css
  }
  if(typeof(options.html) == 'boolean'){
    setting.html = options.html ? {css: true, image: true, js: true} : {css: false, image: false, js: false}
  }else{
    setting.html = cli.utils.extend({css: true, image: true, js: true}, options.html)
  }
  setting.version = options.version
  return setting
}

const getVersion = (version, gitHash)=>{
  let today = new Date();
  let versionType = version;
  if(/\{(.+)\}/.test(version)){
    versionType = version.match(/\{(.+)\}/).pop();
  }
  switch(versionType){
    case "date": return `${today.getFullYear()}${today.getMonth() + 1}${today.getDate()}${today.getHours()}${today.getMinutes()}${today.getSeconds()}`;
    case "hash":
      if(!gitHash){
        throw new Error('项目找不到hash值')
      }
      return gitHash.substr(0, 8);
    default: return versionType
  }
}

const getHtmlRules = (htmlSetting)=>{
  let rules = []
  if(htmlSetting.css){
    rules.push({
      firstExpr: /<link.+href=['"](.+?)['"].*>/g,
      secondExpr: /href=['"](.+?)['"]/i,
      replaceTo: "href='{0}'"
    })
  }
  if(htmlSetting.js){
    rules.push({
      firstExpr: /<script.+src=['"](.+?)['"].*>/g,
      secondExpr: /src=['"](.+?)['"]/i,
      replaceTo: "src='{0}'"
    })
  }

  if(htmlSetting.image){
    rules.push({
      firstExpr: /<img.+src=['"](.+?)['"].*>/g,
      secondExpr: /src=['"](.+?)['"]/i,
      replaceTo: "src='{0}'"
    })
  }
  return rules;

}

const setCssVersion = (content, version, format)=>{
  return content.replace(/url\(['"]?(.+?)['"]?\)/g, (all, match)=>{
    if(/\?/.test(match)){
      match = `${match}&__v=${version}`
    }else{
      match = `${match}?${version}`
    }
    return `url('${format(match)}')`
  })
}

const setHtmlVersion = (content, rules, version, format)=>{
  //替换html里面的链接
  rules.forEach((rule)=>{
    content = content.replace(rule.firstExpr, (line, match)=>{
      if(/\?/.test(match)){
        match = `${match}&__v=${version}`
      }else{
        match = `${match}?${version}`
      }
      line = line.replace(rule.secondExpr, ()=>{
        return rule.replaceTo.replace('{0}', format(match))
      })
      return line
    })
  })
  return content
}

exports.registerPlugin = (cli, options)=>{

  //如果没有版本，那么则不需要注册任何hook
  if(!options.version){
    cli.log.info('sp-version 未设置版本信息，将直接跳过该插件。')
    return;
  }
  let setting = getSetting(options);

  let format = options.formatURL ? cli.runtime.getRuntimeEnvFile(options.formatURL) : function(url){return url}
  let htmlRules = getHtmlRules(setting.html);

  cli.registerHook('route:willResponse', (req, data, responseContent, cb)=>{
    let pathname = data.realPath;
    // 给css内image 加上 version 开发模式下默认为时间戳
    if(/(\.css)$/.test(pathname) && setting.css){
      return cb(null, setCssVersion(responseContent, Date.now(), (url)=>{return url}))
    }

    if(/(\.html)$/.test(pathname)){
      return cb(null, setHtmlVersion(responseContent, htmlRules, Date.now(), (url)=>{return url}))
    }

    return cb(null, responseContent)

  }, 99);

  cli.registerHook('build:didCompile', (buildConfig, data, content, cb)=>{
    if(!content){
      return cb(null, content)
    }
    let version = null;
    try{
      version = getVersion(setting.version, buildConfig.gitHash);
    }catch(e){
      return cb(e)
    }

    if(/(\.html)$/.test(data.outputFilePath)){
      return cb(null, setHtmlVersion(content, htmlRules, version, format))
    }

    if(/\.css/.test(data.outputFilePath)){
      return cb(null, setCssVersion(content, version, format))
    }

    cb(null, content)
  }, 99)
}