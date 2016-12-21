##说明

静态文件后缀添加版本号

```js
{
  "version": "{hash}", //读取git最近一次hash。 {date} 日期
  "html": {  //可选 boolean 或 object 如：  html: true, 则以下三个选项皆为true，如果为false则下面三个选项全为false   默认true，
    "css": true, //可选 是否给html内的css链接加版本号 默认 true
    "js": true,  //可选 是否给html内的js链接加版本号  默认： true
    "image": true //可选 是否给html内的imgae加版本号 默认： true
  },
  "css": true //可选 是否给css文件中的url加版本号 默认 true
}

```