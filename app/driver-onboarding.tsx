import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  DriverApplication,
  DriverCompliance,
  DriverDocument,
  DriverDocumentType,
  acceptDriverDeclaration,
  getDriverApplication,
  getDriverCompliance,
  getOrCreateDriverApplicationDraft,
  saveDriverApplication,
  saveDriverVerificationDetails,
  saveDriverVehicle,
  submitDriverApplication,
  uploadDriverDocument,
} from '@/lib/driver';

const STEPS = [
  'Identity','Personal details','Licence','Vehicle','Registration / CTP',
  'Insurance','Documents','Declarations','Review','Submit',
] as const;

const states = ['NSW','ACT','NT','QLD','SA','TAS','VIC','WA'] as const;
const identityTypes = ['AUSTRALIAN_DRIVER_LICENCE','AUSTRALIAN_PASSPORT','FOREIGN_PASSPORT','BIRTH_CERTIFICATE','OTHER'] as const;
const insuranceTypes = ['ADDITIONAL_MOTOR','COMMERCIAL_BUSINESS_USE','OTHER'] as const;

function Field({ label, value, onChangeText, placeholder, keyboardType = 'default', editable = true, multiline = false }: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder: string;
  keyboardType?: 'default'|'numeric'|'email-address'; editable?: boolean; multiline?: boolean;
}) {
  return <View style={s.field}>
    <Text style={s.label}>{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#aaa69f"
      style={[s.input,multiline&&s.textarea]} keyboardType={keyboardType} editable={editable}
      autoCapitalize={label.includes('EMAIL') ? 'none' : 'words'} multiline={multiline}/>
  </View>;
}

function Choice({ label, selected, onPress }: { label:string; selected:boolean; onPress:()=>void }) {
  return <Pressable onPress={onPress} style={[s.choice,selected&&s.choiceSelected]}>
    <Text style={[s.choiceText,selected&&s.choiceTextSelected]}>{label}</Text>
  </Pressable>;
}

function StatusBadge({ value, good=false }: { value:string; good?:boolean }) {
  return <View style={[s.badge,good&&s.badgeGood]}><Text style={[s.badgeText,good&&s.badgeGoodText]}>{value.replaceAll('_',' ')}</Text></View>;
}

function DocumentCard({ label, hint, type, documents, onUpload, disabled, expiresAt, onSetExpiry, documentNumber, onSetDocumentNumber, issuingJurisdiction, onSetIssuingJurisdiction, documentSubtype }: {
  label:string; hint:string; type:DriverDocumentType; documents:DriverDocument[];
  onUpload:(type:DriverDocumentType,camera:boolean)=>void; disabled:boolean; expiresAt?:string;
  onSetExpiry?:(value:string)=>void; documentNumber?:string; onSetDocumentNumber?:(value:string)=>void;
  issuingJurisdiction?:string; onSetIssuingJurisdiction?:(value:string)=>void; documentSubtype?:string;
}) {
  const doc=documents.find(item=>item.document_type===type);
  const status=doc?.status ?? 'REQUIRED';
  return <View style={s.docCard}>
    <View style={s.docHeader}><View style={{flex:1}}><Text style={s.docTitle}>{label}</Text><Text style={s.docHint}>{hint}</Text></View><StatusBadge value={status} good={status==='VERIFIED'}/></View>
    {onSetDocumentNumber&&<Field label="DOCUMENT NUMBER" value={documentNumber??''} onChangeText={onSetDocumentNumber} placeholder="Document number"/>}
    {onSetIssuingJurisdiction&&<Field label="ISSUING JURISDICTION" value={issuingJurisdiction??''} onChangeText={onSetIssuingJurisdiction} placeholder="NSW / Australia / issuing country"/>}
    {onSetExpiry&&<Field label="EXPIRY DATE" value={expiresAt??''} onChangeText={onSetExpiry} placeholder="YYYY-MM-DD"/>}
    {!!documentSubtype&&<Text style={s.meta}>Document type: {documentSubtype.replaceAll('_',' ')}</Text>}
    {!disabled&&<View style={s.docActions}>
      <Pressable onPress={()=>onUpload(type,true)} style={s.smallButton}><Text style={s.smallButtonText}>TAKE PHOTO</Text></Pressable>
      <Pressable onPress={()=>onUpload(type,false)} style={s.smallOutline}><Text style={s.smallOutlineText}>CHOOSE PHOTO</Text></Pressable>
    </View>}
    {!!doc?.rejection_reason&&<Text style={s.docError}>{doc.rejection_reason}</Text>}
    {doc?.status==='VERIFIED'&&<Text style={s.verifiedNote}>Verified documents cannot be silently replaced. Contact Everest if the evidence needs to change.</Text>}
  </View>;
}

export default function DriverOnboarding() {
  const [application,setApplication]=useState<DriverApplication|null>(null);
  const [compliance,setCompliance]=useState<DriverCompliance|null>(null);
  const [step,setStep]=useState(0);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [uploading,setUploading]=useState<DriverDocumentType|null>(null);
  const [error,setError]=useState('');
  const [email,setEmail]=useState('');

  const [firstName,setFirstName]=useState(''); const [lastName,setLastName]=useState(''); const [dob,setDob]=useState(''); const [phone,setPhone]=useState('');
  const [address,setAddress]=useState(''); const [suburb,setSuburb]=useState(''); const [city,setCity]=useState('Sydney'); const [state,setState]=useState('NSW'); const [postcode,setPostcode]=useState('');
  const [serviceArea,setServiceArea]=useState(''); const [availability,setAvailability]=useState(''); const [notes,setNotes]=useState('');

  const [identityType,setIdentityType]=useState<(typeof identityTypes)[number]>('AUSTRALIAN_DRIVER_LICENCE');
  const [identityNumber,setIdentityNumber]=useState(''); const [identityJurisdiction,setIdentityJurisdiction]=useState('NSW'); const [identityExpiry,setIdentityExpiry]=useState('');

  const [licenceJurisdiction,setLicenceJurisdiction]=useState('NSW'); const [licenceNumber,setLicenceNumber]=useState('');
  const [licenceClass,setLicenceClass]=useState('C'); const [licenceExpiry,setLicenceExpiry]=useState(''); const [licenceRestrictions,setLicenceRestrictions]=useState('');

  const [plate,setPlate]=useState(''); const [vehicleState,setVehicleState]=useState('NSW'); const [make,setMake]=useState(''); const [model,setModel]=useState('');
  const [year,setYear]=useState(''); const [colour,setColour]=useState(''); const [vehicleType,setVehicleType]=useState(''); const [vin,setVin]=useState('');
  const [ownership,setOwnership]=useState<'OWNER'|'AUTHORISED_USER'|'EMPLOYER_VEHICLE'>('OWNER');

  const [registrationExpiry,setRegistrationExpiry]=useState(''); const [registrationRestrictions,setRegistrationRestrictions]=useState('');
  const [ctpProvider,setCtpProvider]=useState(''); const [ctpExpiry,setCtpExpiry]=useState('');

  const [insuranceType,setInsuranceType]=useState<'ADDITIONAL_MOTOR'|'COMMERCIAL_BUSINESS_USE'|'OTHER'|''>('');
  const [insuranceProvider,setInsuranceProvider]=useState(''); const [insurancePolicy,setInsurancePolicy]=useState(''); const [insuranceExpiry,setInsuranceExpiry]=useState('');

  const [declarationKeys,setDeclarationKeys]=useState<string[]>([]);
  const [profilePhotoUploading,setProfilePhotoUploading]=useState(false);

  async function reload() {
    const app=await getDriverApplication();
    setApplication(app);
    if(app) {
      try { setCompliance(await getDriverCompliance(app.id)); } catch { setCompliance(null); }
    }
    return app;
  }

  useEffect(()=>{let active=true;(async()=>{
    try {
      const { data:{user} } = await (await import('@/lib/supabase')).supabase.auth.getUser();
      if(!user) throw new Error('Authentication required');
      setEmail(user.email??'');
      await getOrCreateDriverApplicationDraft();
      const app=await getDriverApplication();
      if(!active)return;
      setApplication(app);
      if(app){
        setFirstName(app.legal_first_name??''); setLastName(app.legal_last_name??''); setDob(app.date_of_birth??'');
        setSuburb(app.suburb??''); setCity(app.city??'Sydney'); setState(app.state??'NSW'); setPostcode(app.postcode??'');
        setAddress(app.address_line??''); setServiceArea(app.service_area??''); setAvailability(app.availability??''); setNotes(app.notes??'');
        const v=app.verification;
        if(v){setLicenceJurisdiction(v.licence_jurisdiction??'NSW');setLicenceNumber(v.licence_number??'');setLicenceClass(v.licence_class??'C');setLicenceExpiry(v.licence_expiry??'');setLicenceRestrictions(v.licence_restrictions??'');setInsuranceProvider(v.insurance_provider??'');setInsurancePolicy(v.insurance_policy_reference??'');setInsuranceType((v.insurance_type as typeof insuranceType)??'');setInsuranceExpiry(v.insurance_expiry??'');}
        const vehicle=app.vehicle;
        if(vehicle){setPlate(vehicle.registration_plate);setVehicleState(vehicle.registration_state);setMake(vehicle.make);setModel(vehicle.model);setYear(vehicle.year?.toString()??'');setColour(vehicle.colour??'');setVehicleType(vehicle.vehicle_type);setVin(vehicle.vin??'');setOwnership(vehicle.ownership_status);setRegistrationExpiry(vehicle.registration_expiry??'');setRegistrationRestrictions(vehicle.registration_restrictions??'');setCtpProvider(vehicle.ctp_provider??'');setCtpExpiry(vehicle.ctp_expiry??'');}
        const accepted=app.declarations.map(item=>item.declaration_key); setDeclarationKeys(accepted);
        try { setCompliance(await getDriverCompliance(app.id)); } catch { setCompliance(null); }
      }
    } catch(e) { if(active)setError(e instanceof Error?e.message:'Unable to load driver onboarding.'); }
    finally { if(active)setLoading(false); }
  })();return()=>{active=false}},[]);

  const editable=!application || ['DRAFT','MORE_INFORMATION_REQUIRED','REJECTED','EXPIRED'].includes(application.status);
  const docs=application?.documents??[];
  const identityDoc=docs.find(d=>d.document_type==='IDENTITY_DOCUMENT');

  async function pickDocument(type:DriverDocumentType,camera:boolean,meta?:{expiresAt?:string;documentNumber?:string;issuingJurisdiction?:string;documentSubtype?:string}) {
    if(!application?.id || !editable)return;
    setError('');setUploading(type);
    try {
      const result=camera
        ? await ImagePicker.launchCameraAsync({mediaTypes:['images'],quality:0.85,base64:true})
        : await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:0.85,base64:true});
      if(result.canceled||!result.assets[0])return;
      await uploadDriverDocument({applicationId:application.id,vehicleId:application.vehicle?.id??null,documentType:type,asset:result.assets[0],expiresAt:meta?.expiresAt??null,documentNumber:meta?.documentNumber,issuingJurisdiction:meta?.issuingJurisdiction,documentSubtype:meta?.documentSubtype});
      await reload();
    } catch(e) { setError(e instanceof Error?e.message:'Document upload failed.'); }
    finally { setUploading(null); }
  }

  async function savePersonal() {
    await saveDriverApplication({legalFirstName:firstName,legalLastName:lastName,dateOfBirth:dob,phone,addressLine:address,suburb,city,state,postcode,serviceArea,availability,notes});
  }
  async function saveLicence() {
    await saveDriverVerificationDetails({licenceJurisdiction,licenceNumber,licenceClass,licenceExpiry,licenceRestrictions,insuranceProvider,insurancePolicyReference:insurancePolicy,insuranceType,insuranceExpiry});
  }
  async function saveVehicle() {
    await saveDriverVehicle({registrationPlate:plate,registrationState:vehicleState,make,model,year:year?Number(year):null,colour,vehicleType,vin,ownershipStatus:ownership,registrationExpiry,registrationRestrictions,ctpProvider,ctpExpiry});
  }
  async function acceptDeclaration(key:string) {
    setError('');setBusy(true);
    try { await acceptDriverDeclaration(key); setDeclarationKeys(current=>current.includes(key)?current: [...current,key]); await reload(); }
    catch(e){setError(e instanceof Error?e.message:'Declaration could not be recorded.');}
    finally{setBusy(false);}
  }
  async function next() {
    setError('');setBusy(true);
    try {
      if(step===1) await savePersonal();
      if(step===2||step===5) await saveLicence();
      if(step===3||step===4) await saveVehicle();
      const app=await reload();
      if(!app)throw new Error('Driver application is unavailable.');
      setStep(Math.min(STEPS.length-1,step+1));
    } catch(e){setError(e instanceof Error?e.message:'Could not save this step.');}
    finally{setBusy(false);}
  }
  async function submit() {
    setError('');setBusy(true);
    try { await savePersonal(); await saveLicence(); await saveVehicle(); await submitDriverApplication(); const app=await reload(); setStep(9); if(app?.status==='SUBMITTED') setCompliance(await getDriverCompliance(app.id)); }
    catch(e){setError(e instanceof Error?e.message:'Your application could not be submitted.');}
    finally{setBusy(false);}
  }
  async function back(){setError('');if(step>0)setStep(step-1);else router.back();}

  const blocking=useMemo(()=>compliance?.overall.blockingItems??[],[compliance]);
  const declarationTemplates=[
    ['INFORMATION_ACCURACY','I confirm the information provided is accurate.'],
    ['VEHICLE_AUTHORITY','I confirm I am authorised to use the vehicle identified.'],
    ['DOCUMENT_AUTHENTICITY','I confirm the documents belong to me or relate to the vehicle/policy identified, and I understand Everest may require additional verification.'],
  ];

  if(loading)return <SafeAreaView style={s.safe}><ActivityIndicator style={{marginTop:60}}/></SafeAreaView>;
  if(!application)return <SafeAreaView style={s.safe}><View style={s.center}><Text style={s.title}>Driver onboarding unavailable</Text><Text style={s.copy}>{error||'Unable to create a driver application draft.'}</Text></View></SafeAreaView>;

  return <SafeAreaView style={s.safe}>
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <View style={s.top}><Pressable onPress={()=>void back()}><Text style={s.back}>‹</Text></Pressable><Text style={s.topTitle}>Driver onboarding</Text><View style={{width:28}}/></View>
      <Text style={s.eyebrow}>EVEREST DELIVERY / {application.compliance_jurisdiction}</Text>
      <Text style={s.title}>{application.status==='APPROVED'?'Driver verified.':application.status==='SUSPENDED'?'Driver access suspended.':'Become an Everest driver.'}</Text>
      <Text style={s.copy}>Everest separates applicant information from compliance decisions. An uploaded document is evidence for review, not proof of government verification.</Text>
      <View style={s.statusCard}><Text style={s.statusEyebrow}>APPLICATION STATUS</Text><View style={s.statusLine}><Text style={s.statusTitle}>{application.status.replaceAll('_',' ')}</Text><StatusBadge value={compliance?.overall.status??application.status} good={compliance?.overall.status==='APPROVED'}/></View><Text style={s.statusCopy}>{application.status==='APPROVED'?'Operational access remains subject to current credentials.':application.status==='EXPIRED'?'A required credential has expired. Update it and request review again.':'You cannot accept delivery work until the server-side compliance gate passes.'}</Text></View>

      {application.status==='APPROVED'&&<Pressable style={s.primaryWide} onPress={()=>router.replace('/delivery')}><Text style={s.primaryText}>OPEN DRIVER DASHBOARD</Text></Pressable>}

      {editable&&<>
        <View style={s.progress}><View style={[s.progressFill,{width:`${((step+1)/STEPS.length)*100}%`}]}/></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.stepRow}>{STEPS.map((label,index)=><View key={label} style={s.step}><View style={[s.stepDot,index<=step&&s.stepDotActive]}><Text style={[s.stepNumber,index<=step&&s.stepNumberActive]}>{index+1}</Text></View><Text style={[s.stepLabel,index===step&&s.stepLabelActive]}>{label}</Text></View>)}</ScrollView>

        {step===0&&<View>
          <Text style={s.sectionTitle}>1. Identity</Text><Text style={s.sectionCopy}>Upload your profile photograph and one identity document. Service NSW lists documents such as an Australian driver licence, Australian passport, foreign passport with visa and birth certificate as examples of identity evidence; Everest still requires its own review. </Text>
          <Text style={s.label}>IDENTITY DOCUMENT TYPE</Text><View style={s.choices}>{identityTypes.map(item=><Choice key={item} label={item.replaceAll('_',' ')} selected={identityType===item} onPress={()=>setIdentityType(item)}/>)}</View>
          <DocumentCard label="Profile photograph" hint="Used for Everest identity review." type="PROFILE_PHOTO" documents={docs} onUpload={(t,c)=>{setProfilePhotoUploading(true);void pickDocument(t,c).finally(()=>setProfilePhotoUploading(false));}} disabled={!!uploading||profilePhotoUploading}/>
          <DocumentCard label="Identity document" hint="Private storage. Manual verification is required unless an authorised provider is configured." type="IDENTITY_DOCUMENT" documents={docs} onUpload={(t,c)=>void pickDocument(t,c,{expiresAt:identityExpiry,documentNumber:identityNumber,issuingJurisdiction:identityJurisdiction,documentSubtype:identityType})} disabled={!!uploading} expiresAt={identityExpiry} onSetExpiry={setIdentityExpiry} documentNumber={identityNumber} onSetDocumentNumber={setIdentityNumber} issuingJurisdiction={identityJurisdiction} onSetIssuingJurisdiction={setIdentityJurisdiction} documentSubtype={identityType}/>
        </View>}

        {step===1&&<View>
          <Text style={s.sectionTitle}>2. Personal details</Text><Text style={s.sectionCopy}>These are legal and residential details used to match the application with the evidence you submit.</Text>
          <Field label="LEGAL FIRST NAME" value={firstName} onChangeText={setFirstName} placeholder="First name"/>
          <Field label="LEGAL LAST NAME" value={lastName} onChangeText={setLastName} placeholder="Last name"/>
          <Field label="DATE OF BIRTH" value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD"/>
          <Field label="PHONE" value={phone} onChangeText={setPhone} placeholder="04xx xxx xxx" keyboardType="numeric"/>
          <Field label="EMAIL" value={email} onChangeText={()=>{}} placeholder="Account email" editable={false}/>
          <Field label="RESIDENTIAL ADDRESS" value={address} onChangeText={setAddress} placeholder="Street address"/>
          <View style={s.two}><View style={s.half}><Field label="SUBURB" value={suburb} onChangeText={setSuburb} placeholder="Suburb"/></View><View style={s.half}><Field label="POSTCODE" value={postcode} onChangeText={setPostcode} placeholder="Postcode" keyboardType="numeric"/></View></View>
          <Field label="CITY" value={city} onChangeText={setCity} placeholder="City"/>
          <Text style={s.label}>STATE / TERRITORY</Text><View style={s.choices}>{states.map(item=><Choice key={item} label={item} selected={state===item} onPress={()=>setState(item)}/>)}</View>
          <Field label="SERVICE AREA" value={serviceArea} onChangeText={setServiceArea} placeholder="e.g. Western Sydney"/>
          <Field label="AVAILABILITY" value={availability} onChangeText={setAvailability} placeholder="e.g. Weekdays 5pm–10pm"/>
          <Field label="OPTIONAL NOTES" value={notes} onChangeText={setNotes} placeholder="Anything relevant" multiline/>
          {state!=='NSW'&&<View style={s.info}><Text style={s.infoTitle}>Jurisdiction configuration</Text><Text style={s.infoCopy}>The initial launch compliance configuration is AU-NSW. Other Australian jurisdictions can be added without changing the onboarding model.</Text></View>}
        </View>}

        {step===2&&<View>
          <Text style={s.sectionTitle}>3. Driver licence</Text><Text style={s.sectionCopy}>For NSW, Transport for NSW offers a Driver Licence Check service to approved organisations. Everest has not claimed access to that service here, so this launch path is MANUAL_REVIEW_REQUIRED. </Text>
          <Text style={s.label}>LICENCE JURISDICTION</Text><View style={s.choices}>{states.concat(['OVERSEAS'] as never[]).map(item=><Choice key={String(item)} label={String(item)} selected={licenceJurisdiction===item} onPress={()=>setLicenceJurisdiction(String(item))}/>)}</View>
          <Field label="LICENCE NUMBER" value={licenceNumber} onChangeText={setLicenceNumber} placeholder="Licence number"/>
          <Field label="LICENCE CLASS" value={licenceClass} onChangeText={setLicenceClass} placeholder="C / LR / MR / HR / HC / MC"/>
          <Field label="LICENCE EXPIRY" value={licenceExpiry} onChangeText={setLicenceExpiry} placeholder="YYYY-MM-DD"/>
          <Field label="LICENCE RESTRICTIONS" value={licenceRestrictions} onChangeText={setLicenceRestrictions} placeholder="Enter restrictions shown on licence, or None" multiline/>
          <DocumentCard label="Licence front" hint="Required evidence." type="LICENCE_FRONT" documents={docs} onUpload={(t,c)=>void pickDocument(t,c,{expiresAt:licenceExpiry,documentNumber:licenceNumber,issuingJurisdiction:licenceJurisdiction,documentSubtype:'DRIVER_LICENCE_FRONT'})} disabled={!!uploading} expiresAt={licenceExpiry} onSetExpiry={setLicenceExpiry}/>
          <DocumentCard label="Licence back" hint="Upload where the issuing jurisdiction uses a reverse side." type="LICENCE_BACK" documents={docs} onUpload={(t,c)=>void pickDocument(t,c,{expiresAt:licenceExpiry,documentNumber:licenceNumber,issuingJurisdiction:licenceJurisdiction,documentSubtype:'DRIVER_LICENCE_BACK'})} disabled={!!uploading}/>
        </View>}

        {step===3&&<View>
          <Text style={s.sectionTitle}>4. Vehicle</Text><Text style={s.sectionCopy}>Vehicle information is stored only in driver_vehicles. There is no legacy vehicle_type or vehicle_registration field in the application record.</Text>
          <View style={s.two}><View style={s.half}><Field label="MAKE" value={make} onChangeText={setMake} placeholder="Toyota"/></View><View style={s.half}><Field label="MODEL" value={model} onChangeText={setModel} placeholder="Corolla"/></View></View>
          <View style={s.two}><View style={s.half}><Field label="YEAR" value={year} onChangeText={setYear} placeholder="2022" keyboardType="numeric"/></View><View style={s.half}><Field label="COLOUR" value={colour} onChangeText={setColour} placeholder="White"/></View></View>
          <Field label="VEHICLE TYPE" value={vehicleType} onChangeText={setVehicleType} placeholder="Car / van / motorcycle"/>
          <Field label="VIN / CHASSIS" value={vin} onChangeText={setVin} placeholder="VIN where appropriate"/>
          <Text style={s.label}>OWNERSHIP / AUTHORISED USE</Text><View style={s.choices}><Choice label="OWNER" selected={ownership==='OWNER'} onPress={()=>setOwnership('OWNER')}/><Choice label="AUTHORISED USER" selected={ownership==='AUTHORISED_USER'} onPress={()=>setOwnership('AUTHORISED_USER')}/><Choice label="EMPLOYER VEHICLE" selected={ownership==='EMPLOYER_VEHICLE'} onPress={()=>setOwnership('EMPLOYER_VEHICLE')}/></View>
        </View>}

        {step===4&&<View>
          <Text style={s.sectionTitle}>5. Registration / CTP</Text><Text style={s.sectionCopy}>Service NSW's official registration check can show registration status, expiry, restrictions and CTP provider/policy expiry. Everest records the admin's evidence and does not treat typed values as official verification. </Text>
          <View style={s.two}><View style={s.half}><Field label="REGISTRATION PLATE" value={plate} onChangeText={setPlate} placeholder="ABC123"/></View><View style={s.half}><Field label="REGISTRATION STATE" value={vehicleState} onChangeText={setVehicleState} placeholder="NSW"/></View></View>
          <Field label="REGISTRATION EXPIRY" value={registrationExpiry} onChangeText={setRegistrationExpiry} placeholder="YYYY-MM-DD"/>
          <Field label="REGISTRATION RESTRICTIONS" value={registrationRestrictions} onChangeText={setRegistrationRestrictions} placeholder="Restrictions / concessions if shown" multiline/>
          <Field label="CTP PROVIDER" value={ctpProvider} onChangeText={setCtpProvider} placeholder="Provider"/>
          <Field label="CTP EXPIRY" value={ctpExpiry} onChangeText={setCtpExpiry} placeholder="YYYY-MM-DD"/>
          <DocumentCard label="Registration evidence" hint="Certificate or other appropriate evidence for admin review." type="REGISTRATION" documents={docs} onUpload={(t,c)=>void pickDocument(t,c,{expiresAt:registrationExpiry,documentNumber:plate,issuingJurisdiction:vehicleState,documentSubtype:'REGISTRATION_EVIDENCE'})} disabled={!!uploading} expiresAt={registrationExpiry} onSetExpiry={setRegistrationExpiry}/>
        </View>}

        {step===5&&<View>
          <Text style={s.sectionTitle}>6. Insurance</Text><Text style={s.sectionCopy}>CTP is tracked separately from additional motor insurance. Do not tell Everest that a policy covers paid delivery work unless the policy wording has actually been reviewed and confirmed.</Text>
          <Text style={s.label}>ADDITIONAL INSURANCE TYPE</Text><View style={s.choices}><Choice label="Not providing additional insurance" selected={insuranceType===''} onPress={()=>setInsuranceType('')}/>{insuranceTypes.map(item=><Choice key={item} label={item.replaceAll('_',' ')} selected={insuranceType===item} onPress={()=>setInsuranceType(item)}/>)}</View>
          {insuranceType&&<><Field label="INSURER" value={insuranceProvider} onChangeText={setInsuranceProvider} placeholder="Insurer"/><Field label="POLICY / REFERENCE" value={insurancePolicy} onChangeText={setInsurancePolicy} placeholder="Policy number or reference"/><Field label="POLICY EXPIRY" value={insuranceExpiry} onChangeText={setInsuranceExpiry} placeholder="YYYY-MM-DD"/><DocumentCard label="Insurance evidence" hint="Manual review required unless an authorised provider is configured." type="INSURANCE" documents={docs} onUpload={(t,c)=>void pickDocument(t,c,{expiresAt:insuranceExpiry,documentNumber:insurancePolicy,issuingJurisdiction:'AU',documentSubtype:insuranceType})} disabled={!!uploading} expiresAt={insuranceExpiry} onSetExpiry={setInsuranceExpiry}/></>}
          {!insuranceType&&<View style={s.info}><Text style={s.infoTitle}>Additional insurance is not currently a launch blocking requirement.</Text><Text style={s.infoCopy}>Everest can make this requirement mandatory through jurisdiction configuration without changing the onboarding flow.</Text></View>}
        </View>}

        {step===6&&<View>
          <Text style={s.sectionTitle}>7. Documents</Text><Text style={s.sectionCopy}>These documents remain in a private storage bucket. Admins receive short-lived signed URLs for review.</Text>
          <DocumentCard label={ownership==='OWNER'?'Vehicle ownership evidence':'Vehicle authorisation evidence'} hint="Evidence must support the selected use status." type={ownership==='OWNER'?'VEHICLE_OWNERSHIP':'VEHICLE_AUTHORIZATION'} documents={docs} onUpload={(t,c)=>void pickDocument(t,c,{documentSubtype:ownership})} disabled={!!uploading}/>
          <DocumentCard label="Vehicle front" hint="Clear exterior photograph." type="VEHICLE_FRONT" documents={docs} onUpload={(t,c)=>void pickDocument(t,c,{documentSubtype:'VEHICLE_FRONT'})} disabled={!!uploading}/>
          <DocumentCard label="Vehicle rear" hint="Clear exterior photograph." type="VEHICLE_REAR" documents={docs} onUpload={(t,c)=>void pickDocument(t,c,{documentSubtype:'VEHICLE_REAR'})} disabled={!!uploading}/>
          <DocumentCard label="Vehicle side" hint="Clear exterior photograph." type="VEHICLE_SIDE" documents={docs} onUpload={(t,c)=>void pickDocument(t,c,{documentSubtype:'VEHICLE_SIDE'})} disabled={!!uploading}/>
        </View>}

        {step===7&&<View>
          <Text style={s.sectionTitle}>8. Declarations</Text><Text style={s.sectionCopy}>These are Everest application declarations, not invented legal terms. The accepted text and version are stored server-side with the application.</Text>
          {declarationTemplates.map(([key,text])=><Pressable key={key} disabled={busy} onPress={()=>void acceptDeclaration(key)} style={[s.declaration,declarationKeys.includes(key)&&s.declarationAccepted]}><View style={[s.checkbox,declarationKeys.includes(key)&&s.checkboxChecked]}><Text style={s.checkboxText}>{declarationKeys.includes(key)?'✓':''}</Text></View><View style={{flex:1}}><Text style={s.declarationTitle}>{key.replaceAll('_',' ')}</Text><Text style={s.declarationText}>{text}</Text></View></Pressable>)}
        </View>}

        {step===8&&<View>
          <Text style={s.sectionTitle}>9. Review</Text><Text style={s.sectionCopy}>The compliance engine is server-side. A passing application is not automatically approved; an admin must make the approval decision.</Text>
          {compliance&&<View style={s.complianceCard}>
            {(['identity','licence','vehicle','registration','ctp','insurance'] as const).map(key=><View key={key} style={s.complianceRow}><Text style={s.complianceLabel}>{key.replaceAll('_',' ')}</Text><StatusBadge value={compliance[key].status} good={compliance[key].status==='VERIFIED'}/></View>)}
            <View style={s.overall}><Text style={s.overallTitle}>Overall: {compliance.overall.status.replaceAll('_',' ')}</Text>{blocking.length>0&&<Text style={s.blocking}>Blocking items: {blocking.join(', ').replaceAll('_',' ')}</Text>}{compliance.overall.expiresSoon.map(item=><Text key={item.credential+item.days} style={s.warningText}>{item.credential} expires in {item.days} days.</Text>)}</View>
          </View>}
          <Text style={s.section}>Evidence summary</Text><Text style={s.meta}>Identity document: {identityDoc?.status??'MISSING'} · Licence front: {docs.find(d=>d.document_type==='LICENCE_FRONT')?.status??'MISSING'} · Registration: {docs.find(d=>d.document_type==='REGISTRATION')?.status??'MISSING'}</Text>
          <Text style={s.meta}>Vehicle: {application.vehicle? `${application.vehicle.make} ${application.vehicle.model} / ${application.vehicle.registration_plate}`:'MISSING'}</Text>
        </View>}

        {step===9&&<View>
          <Text style={s.sectionTitle}>10. Submit</Text><Text style={s.sectionCopy}>Submitting moves the application to SUBMITTED. It does not approve you or perform a government check. Admin review remains required.</Text>
          {blocking.length>0&&<View style={s.warning}><Text style={s.warningTitle}>Complete the blocking items first</Text><Text style={s.warningCopy}>{blocking.join(', ').replaceAll('_',' ')}</Text></View>}
          <Pressable disabled={busy||blocking.length>0} onPress={()=>void submit()} style={[s.primaryWide,(busy||blocking.length>0)&&s.disabled]}><Text style={s.primaryText}>{busy?'SUBMITTING…':'SUBMIT DRIVER APPLICATION'}</Text></Pressable>
        </View>}

        {!!error&&<Text style={s.error}>{error}</Text>}
        {step>0&&<View style={s.nav}><Pressable disabled={busy} onPress={()=>setStep(current=>Math.max(0,current-1))} style={s.outline}><Text style={s.outlineText}>BACK</Text></Pressable>{step<9&&<Pressable disabled={busy} onPress={()=>void next()} style={s.primary}><Text style={s.primaryText}>{busy?'SAVING…':'SAVE & CONTINUE'}</Text></Pressable>}</View>}
      </>}
    </ScrollView>
  </SafeAreaView>;
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:'#f8f7f4'},page:{padding:20,paddingBottom:70,maxWidth:860,width:'100%',alignSelf:'center'},
  top:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:20},back:{fontSize:34,fontWeight:'300'},topTitle:{fontSize:16,fontWeight:'800'},
  eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:2,color:'#777'},title:{fontSize:31,fontWeight:'900',marginTop:7},copy:{fontSize:12,lineHeight:19,color:'#777',marginTop:8,marginBottom:16},
  statusCard:{backgroundColor:'#fff',borderRadius:18,borderWidth:1,borderColor:'#e5e2dc',padding:16,marginTop:12},statusEyebrow:{fontSize:8,fontWeight:'900',letterSpacing:1.4,color:'#777'},statusLine:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:5},statusTitle:{fontSize:18,fontWeight:'900'},statusCopy:{fontSize:11,lineHeight:17,color:'#777',marginTop:7},
  badge:{alignSelf:'flex-start',backgroundColor:'#f3eee4',borderRadius:12,paddingHorizontal:9,paddingVertical:6},badgeGood:{backgroundColor:'#e7f3eb'},badgeText:{fontSize:7,fontWeight:'900',letterSpacing:.6,color:'#765f2d'},badgeGoodText:{color:'#2c6842'},
  primaryWide:{height:52,borderRadius:13,backgroundColor:'#111',alignItems:'center',justifyContent:'center',marginTop:16},primary:{height:50,borderRadius:13,backgroundColor:'#111',alignItems:'center',justifyContent:'center',paddingHorizontal:18,flex:1},primaryText:{color:'#fff',fontSize:9,fontWeight:'900',letterSpacing:.6},disabled:{opacity:.45},
  progress:{height:6,borderRadius:4,backgroundColor:'#e5e2dc',overflow:'hidden',marginTop:22},progressFill:{height:'100%',backgroundColor:'#111'},stepRow:{gap:14,paddingVertical:15},step:{alignItems:'center',width:74},stepDot:{width:25,height:25,borderRadius:13,borderWidth:1,borderColor:'#d8d3ca',alignItems:'center',justifyContent:'center',backgroundColor:'#fff'},stepDotActive:{backgroundColor:'#111',borderColor:'#111'},stepNumber:{fontSize:9,fontWeight:'800',color:'#777'},stepNumberActive:{color:'#fff'},stepLabel:{fontSize:7,fontWeight:'700',color:'#999',textAlign:'center',marginTop:5},stepLabelActive:{color:'#111'},
  sectionTitle:{fontSize:21,fontWeight:'900',marginTop:10},sectionCopy:{fontSize:11,lineHeight:18,color:'#777',marginTop:6,marginBottom:15},section:{fontSize:11,fontWeight:'900',marginTop:18,marginBottom:7},label:{fontSize:8,fontWeight:'900',letterSpacing:1.1,color:'#777',marginBottom:6,marginTop:12},
  field:{marginTop:10},input:{minHeight:48,borderRadius:12,borderWidth:1,borderColor:'#ddd8cf',backgroundColor:'#fff',paddingHorizontal:13,fontSize:12,color:'#111'},textarea:{minHeight:85,paddingTop:12,textAlignVertical:'top'},two:{flexDirection:'row',gap:10},half:{flex:1},
  choices:{flexDirection:'row',flexWrap:'wrap',gap:7},choice:{borderWidth:1,borderColor:'#ddd8cf',borderRadius:11,paddingHorizontal:11,paddingVertical:10,backgroundColor:'#fff'},choiceSelected:{backgroundColor:'#111',borderColor:'#111'},choiceText:{fontSize:9,fontWeight:'800',color:'#555'},choiceTextSelected:{color:'#fff'},
  docCard:{backgroundColor:'#fff',borderWidth:1,borderColor:'#e5e2dc',borderRadius:16,padding:14,marginTop:12},docHeader:{flexDirection:'row',gap:10,alignItems:'flex-start'},docTitle:{fontSize:12,fontWeight:'900'},docHint:{fontSize:10,lineHeight:15,color:'#777',marginTop:3},docActions:{flexDirection:'row',gap:8,marginTop:12},smallButton:{backgroundColor:'#111',borderRadius:10,paddingHorizontal:12,paddingVertical:10},smallButtonText:{fontSize:8,fontWeight:'900',color:'#fff'},smallOutline:{borderWidth:1,borderColor:'#d8d3ca',borderRadius:10,paddingHorizontal:12,paddingVertical:10},smallOutlineText:{fontSize:8,fontWeight:'900'},docError:{fontSize:10,lineHeight:15,color:'#a12820',marginTop:8},verifiedNote:{fontSize:9,lineHeight:14,color:'#6d665c',marginTop:9},
  declaration:{flexDirection:'row',gap:12,alignItems:'flex-start',backgroundColor:'#fff',borderWidth:1,borderColor:'#e5e2dc',borderRadius:15,padding:14,marginTop:10},declarationAccepted:{borderColor:'#aabdaF',backgroundColor:'#f7fbf8'},checkbox:{width:24,height:24,borderRadius:7,borderWidth:1,borderColor:'#d0cbc2',alignItems:'center',justifyContent:'center'},checkboxChecked:{backgroundColor:'#111',borderColor:'#111'},checkboxText:{color:'#fff',fontWeight:'900'},declarationTitle:{fontSize:10,fontWeight:'900'},declarationText:{fontSize:10,lineHeight:16,color:'#777',marginTop:4},
  complianceCard:{backgroundColor:'#fff',borderRadius:16,borderWidth:1,borderColor:'#e5e2dc',padding:14,marginTop:12},complianceRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#efede8'},complianceLabel:{fontSize:10,fontWeight:'800'},overall:{marginTop:12,padding:12,borderRadius:12,backgroundColor:'#f8f7f4'},overallTitle:{fontSize:12,fontWeight:'900'},blocking:{fontSize:10,lineHeight:15,color:'#a12820',marginTop:5},warningText:{fontSize:10,lineHeight:15,color:'#765f2d',marginTop:4},
  info:{backgroundColor:'#f3eee4',borderRadius:13,padding:12,marginTop:14},infoTitle:{fontSize:10,fontWeight:'900'},infoCopy:{fontSize:10,lineHeight:16,color:'#777',marginTop:4},warning:{backgroundColor:'#fff4df',borderRadius:13,padding:13,marginTop:12},warningTitle:{fontSize:11,fontWeight:'900'},warningCopy:{fontSize:10,lineHeight:16,color:'#765f2d',marginTop:4},
  error:{fontSize:11,lineHeight:17,color:'#a12820',marginTop:14},meta:{fontSize:10,lineHeight:16,color:'#777',marginTop:5},nav:{flexDirection:'row',gap:9,marginTop:20},outline:{height:50,borderRadius:13,borderWidth:1,borderColor:'#d8d3ca',alignItems:'center',justifyContent:'center',paddingHorizontal:18},outlineText:{fontSize:9,fontWeight:'900'},center:{flex:1,padding:30,justifyContent:'center',alignItems:'center'}
});
