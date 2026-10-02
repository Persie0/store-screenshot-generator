import type { StoreSize } from './platform.ts';

export type TextPlacement={x:number;y:number;width:number;fontSize:number;lineHeight:number;maxLines:2};
export type DevicePlacement={x:number;y:number;width:number;height:number};
export type CreativeComposition={headline:TextPlacement;subheadline:TextPlacement;device:DevicePlacement};

export function fitContainedRect(sourceWidth:number,sourceHeight:number,x:number,y:number,width:number,height:number){
 const scale=Math.min(width/sourceWidth,height/sourceHeight);
 const fittedWidth=sourceWidth*scale,fittedHeight=sourceHeight*scale;
 return {x:x+(width-fittedWidth)/2,y:y+(height-fittedHeight)/2,width:fittedWidth,height:fittedHeight};
}

export function getCreativeComposition(size:StoreSize,headlineLines=2,subheadlineLines=2,contentAspect?:number):CreativeComposition {
 const w=size.width,h=size.height;
 if(size.kind==='landscape'){
  const headline:TextPlacement={x:w*.07,y:h*.2,width:w*.5,fontSize:h*.1,lineHeight:h*.112,maxLines:2};
  const subheadline:TextPlacement={x:headline.x,y:headline.y+(headlineLines-1)*headline.lineHeight+headline.fontSize+h*.035,width:w*.5,fontSize:h*.048,lineHeight:h*.058,maxLines:2};
  const deviceHeight=h*.82,aspect=Math.min(.9,Math.max(.35,contentAspect||.61)),deviceWidth=Math.min(w*.25,deviceHeight*aspect);
  return {headline,subheadline,device:{x:w*.71,y:h*.09,width:deviceWidth,height:deviceHeight}};
 }
 const left=w*.075,copyWidth=w*.85;
 const headline:TextPlacement={x:left,y:h*.065,width:copyWidth,fontSize:w*.064,lineHeight:w*.071,maxLines:2};
 const subheadline:TextPlacement={x:left,y:headline.y+(headlineLines-1)*headline.lineHeight+headline.fontSize+Math.min(26,h*.012),width:copyWidth,fontSize:w*.028,lineHeight:w*.04,maxLines:2};
 const copyBottom=subheadline.y+(subheadlineLines-1)*subheadline.lineHeight+subheadline.fontSize;
 const deviceGap=Math.min(76,Math.max(52,h*.025));
 const bottomMargin=Math.max(28,h*.024);
 const bottom=h-bottomMargin;
 const minTop=copyBottom+deviceGap;
 const availableHeight=Math.max(1,bottom-minTop);
 const aspect=Math.min(.9,Math.max(.35,contentAspect||(size.label.includes('iPad')?.78:.52)));
 let deviceHeight=availableHeight;
 let deviceWidth=deviceHeight*aspect;
 const maxWidth=w*.78;
 if(deviceWidth>maxWidth){deviceWidth=maxWidth;deviceHeight=deviceWidth/aspect}
 const y=bottom-deviceHeight;
 return {headline,subheadline,device:{x:(w-deviceWidth)/2,y,width:deviceWidth,height:deviceHeight}};
}
