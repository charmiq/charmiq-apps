# Code Preview

*Edit the HTML and CSS side by side. Reload the preview. The document is the source code.*

## The Preview

<p style="text-align: center;">
  <iframe-app height="400px" width="60%" style="border: 1px solid lightgrey; border-radius: 4px;" src="charmiq://.">
  </iframe-app>
</p>


## The Source

<p style="text-align: center;">
  <iframe-app data-name="html-editor" height="350px" width="49%" src="charmiq://../../apps/codemirror-editor" style="border: 1px solid lightgrey;">
    <app-content name="index.html">
<div id="container">
  Make
  <div id="flip">
    <div><div>Work</div></div>
    <div><div>LifeStyle</div></div>
    <div><div>Everything</div></div>
  </div>
  Awesome!
</div>

<p>a css3 animation demo</p>
    </app-content>
    <app-state>
{
  "config": {
    "lineNumbers": true,
    "lineWrapping": false,
    "smartIndent": true,
    "indentWithTabs": false,
    "maxTabs": 1
  },
  "tabModes": {
    "hTm1Kx9Pqw": "htmlmixed"
  },
  "tabOrder": [
    "hTm1Kx9Pqw"
  ]
}
    </app-state>
  </iframe-app> <iframe-app data-name="css-editor" height="350px" width="49%" src="charmiq://../../apps/codemirror-editor" style="border: 1px solid lightgrey;">
    <app-content name="style.css">
@import url('https://fonts.googleapis.com/css?family=Roboto:700');

body {
  margin: 0;
  font-family: 'Roboto';
  text-align: center;
}

#container {
  color: #999;
  text-transform: uppercase;
  font-size: 36px;
  font-weight: bold;
  padding-top: 200px;
  position: fixed;
  width: 100%;
  bottom: 45%;
  display: block;
}

#flip {
  height: 50px;
  overflow: hidden;
}

#flip > div > div {
  color: #fff;
  padding: 4px 12px;
  height: 45px;
  margin-bottom: 45px;
  display: inline-block;
}

#flip div:first-child {
  animation: show 5s linear infinite;
}

#flip div div {
  background: #42c58a;
}
#flip div:first-child div {
  background: #4ec7f3;
}
#flip div:last-child div {
  background: #DC143C;
}

@keyframes show {
  0% { margin-top: -270px; }
  5% { margin-top: -180px; }
  33% { margin-top: -180px; }
  38% { margin-top: -90px; }
  66% { margin-top: -90px; }
  71% { margin-top: 0px; }
  99.99% { margin-top: 0px; }
  100% { margin-top: -270px; }
}

p {
  position: fixed;
  width: 100%;
  bottom: 30px;
  font-size: 12px;
  color: #999;
  margin-top: 200px;
}
    </app-content>
    <app-state>
{
  "config": {
    "lineNumbers": true,
    "lineWrapping": false,
    "smartIndent": true,
    "indentWithTabs": false,
    "maxTabs": 1
  },
  "tabModes": {
    "cSs3Nv7Rjd": "css"
  },
  "tabOrder": [
    "cSs3Nv7Rjd"
  ]
}
    </app-state>
  </iframe-app>
</p>


## How This Works

The preview at the top isn't a standalone HTML file. It's assembled on the fly from the two editor panels below it.

The [`manifest.json`](charmiq://./manifest.json) declares a static `bundle.format: "html"` application with two files — `/index.html` and `/style.css`. Instead of pointing at files in the folder, the manifest pulls content from this very document:

```
"files": {
  "/index.html": "charmiq://./README.md?selector=iframe-app[name='html-editor']/app-content[name='index.html']&format=plain",
  "/style.css":  "charmiq://./README.md?selector=iframe-app[name='css-editor']/app-content[name='style.css']&format=plain"
}
```

Each `charmiq://` URI resolves to an `<app-content>` block inside one of the CodeMirror editors above. The server extracts the plain text, assembles the HTML document, and serves it as the preview iframe.

Edit the CSS — change a color, adjust the animation timing. Edit the HTML — swap "lifeStyle" for "Vacation". Reload the preview. Your changes are live.

**What's demonstrated:**
- `bundle.files` pulling content from `<app-content>` blocks in a sibling document
- Two CodeMirror editors embedded side by side, each locked to a single tab
- A static application whose source lives entirely inside the document that presents it


## Credit

The CSS text animation is inspired by Nooray Yemon's [Simple CSS Text Animation](https://codepen.io/yemon/pen/pWoROm).
