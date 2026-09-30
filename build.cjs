const fs=require('node:fs');fs.rmSync('dist',{recursive:true,force:true});fs.cpSync('public','dist',{recursive:true});console.log('WeCare: static production build created in dist/');
