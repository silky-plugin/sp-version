const _fs = require('fs-extra');
const _path = require('path');
const _exec = require('child_process').exec;
const _async = require('async')
let _version = ""

const extend = (source, dest)=>{
  if(!dest){
    return source
  }
  if(!source){
    return dest
  }
  Object.keys(dest).forEach(function(key){
    source[key] = dest[key]
  })
  return source
}

const indexOf = (arr, item)=>{
  for(let i= 0, len = arr.length; i < len; i++){
    if(item.toLowerCase() == arr[i].toLowerCase()){
      return i
    }
  }
  return -1
}

const nowHash = function(){
  let today = new Date();
  return `${today.getFullYear()}${today.getMonth() + 1}${today.getDate()}${today.getHours()}${today.getMinutes()}${today.getSeconds()}`;
}

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
    setting.html = extend({css: true, image: true, js: true}, options.html)
  }
  setting.version = options.version
  setting.versionAsDir = options.versionAsDir
  return setting
}

const getVersion = (version, gitHash)=>{
  let versionType = version;
  if(/\{(.+)\}/.test(version)){
    versionType = version.match(/\{(.+)\}/).pop();
  }
  switch(versionType){
    case "now": return nowHash()
    case "date": return nowHash()
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

//替换css里面的image
const setCssVersion = (content, version, format)=>{
  return content.replace(/url\(['"]?(.+?)['"]?\)/g, (all, match)=>{
    if(match.indexOf("http://") == 0 || match.indexOf("https://") == 0 || match.indexOf("//") == 0){
      return all
    }
    return `url('${format(match,version)}')`
  })
}

const setHtmlVersion = (content, rules, version, format)=>{
  //替换html里面的链接
  rules.forEach((rule)=>{
    content = content.replace(rule.firstExpr, (line, match)=>{
      if(match.indexOf("http://") == 0 || match.indexOf("https://") == 0 || match.indexOf("//") == 0){
        return line
      }
      line = line.replace(rule.secondExpr, ()=>{
        return rule.replaceTo.replace('{0}', format(match, version))
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


  let htmlRules = getHtmlRules(setting.html);

  cli.registerHook('route:willResponse', (req, data, responseContent, cb)=>{
    let pathname = data.realPath;
    // 给css内image 加上 version 开发模式下默认为时间戳
    if(/(\.css)$/.test(pathname) && setting.css){
      return cb(null, setCssVersion(responseContent, Date.now(), (url, version)=>{return url+"?"+version}))
    }

    if(/(\.html)$/.test(pathname)){
      return cb(null, setHtmlVersion(responseContent, htmlRules, Date.now(), (url, version)=>{return url+"?"+version}))
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
    
    let format = function(url){return url}
    if(options.formatURL){
      format = cli.runtime.getRuntimeEnvFile(options.formatURL) 
    }else if(indexOf(process.argv, "-X") != -1){
      let pkg = require(_path.join(cli.cwd(), "package.json"))
      format = function(url){ 
        if(/^(http:|https:)?\/\//.test(url)){
          return url
        }
        return "/" +pkg.name + url
      }
    }
    
    if(/(\.html)$/.test(data.outputFilePath)){
      return cb(null, setHtmlVersion(content, htmlRules, version, format))
    }

    if(/\.css/.test(data.outputFilePath)){
      return cb(null, setCssVersion(content, version, format))
    }

    cb(null, content)
  }, 99)
  if(!setting.versionAsDir){
    return
  }
  cli.registerHook('build:end', (buildConfig, cb)=>{
    let version = null;
    try{
      version = getVersion(setting.version, buildConfig.gitHash);
    }catch(e){
      return cb(e)
    }
    let queue = [];
    let cssOut = _path.join(buildConfig.outdir, "css");
    if(_fs.existsSync(cssOut)){
         queue.push(function(next){
          _fs.move(cssOut, _path.join(buildConfig.outdir, version+"-css"), next)
        })
        queue.push((next)=>{
          _fs.mkdirpSync(cssOut)
          _fs.move(_path.join(buildConfig.outdir, version+"-css"), _path.join(cssOut, version), next)
        })
    }
    let jsOut =  _path.join(buildConfig.outdir, "js");
    if(_fs.existsSync(jsOut)){
      queue.push(function(next){
        _fs.move(jsOut, _path.join(buildConfig.outdir, version+"-js"), next)
      })
      queue.push((next)=>{
        _fs.mkdirpSync(jsOut)
        _fs.move(_path.join(buildConfig.outdir, version+"-js"), _path.join(jsOut,version), next)
      })
    }
   let imageOut = _path.join(buildConfig.outdir, "image")
   if(_fs.existsSync(imageOut)){
      queue.push(function(next){
        _fs.move(imageOut, _path.join(buildConfig.outdir, version+"-image"), next)
      })
      queue.push((next)=>{
        _fs.mkdirpSync(imageOut)
        _fs.move(_path.join(buildConfig.outdir, version+"-image"), _path.join(imageOut,version), next)
      })
   }
    _async.waterfall(queue, cb)
  }, 90)
}