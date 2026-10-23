import {useCallback,useEffect,useRef,useState} from 'react';
import {sectionFailure,sectionStart,type SectionState} from './section-state';

/** Key-scoped reads settle independently and ignore superseded responses. */
export function useSection<T>(key:string|null,loader:()=>PromiseLike<T>){
 const loadRef=useRef(loader);loadRef.current=loader;
 const activeKey=useRef(key);activeKey.current=key;
 const version=useRef(0);
 const [state,setState]=useState<SectionState<T>>({key:null,data:null,loading:false,error:false});
 const retry=useCallback(async()=>{
  if(key===null||activeKey.current!==key)return;
  const current=++version.current;
  setState(previous=>sectionStart(previous,key));
  try{
   const data=await loadRef.current();
   if(version.current===current)setState({key,data,loading:false,error:false});
  }catch(error){
   if(version.current===current)setState(previous=>sectionFailure(previous,error));
  }
 },[key]);
 const invalidate=useCallback(()=>{version.current++},[]);
 useEffect(()=>{void retry();return invalidate},[retry,invalidate]);
 const visible=state.key===key?state:{key,data:null,loading:key!==null,error:false};
 return {...visible,retry};
}
