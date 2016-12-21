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

const getVersion = (version, cb)=>{
  let commandStr = `git log -1 --format="%h"`;
  let today = new Date();
  let versionType = version;
  if(/\{(.+)\}/.test(version)){
    versionType = version.match(/\{(.+)\}/).pop();
  }
  switch(versionType){
    case "date": return cb(null, `${today.getFullYear()}${today.getMonth() + 1}${today.getDate()}${today.getHours()}${today.getMinutes()}${today.getSeconds()}`);
    case "hash":
      if(!_fs.existsSync(_path.join(process.cwd(), ".git"))){
        return cb(new Error("非git项目不能生成hash值"))
      }
      _exec(commandStr, {cwd: process.cwd()}, (error, stdout, stderr)=>{
        if(error){
          return cb(error)
        }
        stdout = stdout.replace(/^(\s)+/, "").replace(/(\s)+$/, "");
        if(/\s/.test(stdout)){
          return cb(new Error("没有commit 历史， 无法生成hash值"))
        }
        cb(null, stdout)
      })
    default: cb(null, versionType)
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

const setCssVersion = (content, version)=>{
  return content.replace(/url\(['"]?(.+?)['"]?\)/g, (all, match)=>{
    if(/\?/.test(match)){
      match = `${match}&__v=${version}`
    }else{
      match = `${match}?${version}`
    }
    return `url('${match}')`
  })
}

const setHtmlVersion = (content, rules, version)=>{
  //替换html里面的链接
  rules.forEach((rule)=>{
    content = content.replace(rule.firstExpr, (line, match)=>{
      if(/\?/.test(match)){
        match = `${match}&__v=${version}`
      }else{
        match = `${match}?${version}`
      }
      line = line.replace(rule.secondExpr, ()=>{
        return rule.replaceTo.replace('{0}', match)
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
  getVersion(setting.version, (error, version)=>{
    if(error){throw error}
    _version = version;
  });

  let htmlRules = getHtmlRules(setting.html);

  cli.registerHook('route:willResponse', (req, data, responseContent, cb)=>{
    let pathname = data.realPath;
    // 给css内image 加上 version
    if(/(\.css)$/.test(pathname) && setting.css){
        return cb(null, setCssVersion(responseContent, _version))
    }

    if(!/(\.html)$/.test(pathname)){
      return cb(null, responseContent)
    }

    cb(null, setHtmlVersion(responseContent, htmlRules, _version))

  }, 99);

  cli.registerHook('build:didCompile', (buildConfig, data, content, cb)=>{
    if(!content){
      return cb(null, content)
    }
    if(/(\.html)$/.test(data.outputFilePath)){
      return cb(null, setHtmlVersion(content, htmlRules, _version))
    }

    if(/\.css/.test(data.outputFilePath)){
      return cb(null, setCssVersion(content, _version))
    }
    cb(null, content)
  }, 99)
}