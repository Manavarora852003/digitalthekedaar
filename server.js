const express=require('express');
const path=require('path');
const fs=require('fs');
const crypto=require('crypto');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const helmet=require('helmet');
const rateLimit=require('express-rate-limit');
const multer=require('multer');
const Database=require('better-sqlite3');

const PORT=process.env.PORT||3000;
const JWT_SECRET=process.env.JWT_SECRET||'change-this-secret-before-production';
const ADMIN_EMAIL=process.env.ADMIN_EMAIL||'admin@digitalthekedaar.in';
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'ChangeMe123!';
const ROOT=__dirname;
const DATA=path.join(ROOT,'data');
fs.mkdirSync(DATA,{recursive:true});
fs.mkdirSync(path.join(ROOT,'public','uploads'),{recursive:true});
const db=new Database(path.join(DATA,'digital-thekedaar.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('worker','customer','admin')), name TEXT NOT NULL, mobile TEXT UNIQUE, email TEXT UNIQUE, password_hash TEXT, status TEXT NOT NULL DEFAULT 'Active', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS workers(id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, category TEXT NOT NULL, skills TEXT DEFAULT '', experience INTEGER DEFAULT 0, location TEXT NOT NULL, hourly_rate REAL DEFAULT 0, daily_rate REAL DEFAULT 0, bio TEXT DEFAULT '', availability TEXT DEFAULT 'Available', verification_status TEXT DEFAULT 'Pending', rating REAL DEFAULT 0, reviews INTEGER DEFAULT 0, photo TEXT DEFAULT '', kyc_doc TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, location TEXT DEFAULT '', address TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id), worker_id TEXT NOT NULL REFERENCES workers(id), title TEXT NOT NULL, description TEXT DEFAULT '', location TEXT NOT NULL, work_date TEXT, duration_hours REAL DEFAULT 1, agreed_amount REAL DEFAULT 0, status TEXT DEFAULT 'Pending', payment_status TEXT DEFAULT 'Unpaid', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY, job_id TEXT REFERENCES jobs(id), customer_id TEXT NOT NULL, worker_id TEXT NOT NULL, rating INTEGER NOT NULL, comment TEXT DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS complaints(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, job_id TEXT, subject TEXT NOT NULL, message TEXT NOT NULL, status TEXT DEFAULT 'Open', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY, job_id TEXT NOT NULL, amount REAL NOT NULL, method TEXT DEFAULT 'Demo', status TEXT DEFAULT 'Pending', gateway_ref TEXT DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_logs(id TEXT PRIMARY KEY, admin_id TEXT, action TEXT NOT NULL, entity TEXT, entity_id TEXT, details TEXT, created_at TEXT NOT NULL);
`);

function id(){return crypto.randomUUID()}
function now(){return new Date().toISOString()}
function seed(){
 const count=db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin'").get().c;
 if(!count){const uid=id();db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?,?)").run(uid,'admin','Manav Arora',ADMIN_EMAIL,null,bcrypt.hashSync(ADMIN_PASSWORD,12),'Active',now());}
 const wc=db.prepare("SELECT COUNT(*) c FROM workers").get().c;
 if(!wc){
  const samples=[['Ramesh Kumar','98XXXXXX21','Mason','Brickwork, plastering',8,'Gurugram',100,750,'Experienced mason for residential and commercial work','Verified'],['Suresh Yadav','97XXXXXX64','Painter','Interior, exterior, putty',6,'Gurugram',110,800,'Clean finishing and reliable work','Verified'],['Amit Kumar','99XXXXXX18','Electrician','Wiring, switches, repair',5,'Delhi',120,900,'Electrical repair and installation','Verified'],['Rajesh','98XXXXXX32','Plumber','Pipes, taps, bathroom fittings',7,'Gurugram',115,850,'Plumbing repair and installation','Pending'],['Mohan Singh','98XXXXXX44','Carpenter','Furniture, doors, modular work',9,'Manesar',135,1000,'Custom woodwork and repair','Verified']];
  const tx=db.transaction(()=>{for(const s of samples){const u=id();db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?,?)").run(u,'worker',s[0],s[1],null,null,'Active',now());db.prepare("INSERT INTO workers VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(u,s[2],s[3],s[4],s[5],s[6],s[7],s[8],'Available',s[9],4.8,10,'','');}});tx();
 }
}
seed();

const app=express();
app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:'1mb'}));
app.use(express.urlencoded({extended:true,limit:'1mb'}));
app.use(rateLimit({windowMs:15*60*1000,max:500,standardHeaders:true,legacyHeaders:false}));
app.use(express.static(path.join(ROOT,'public')));

const upload=multer({storage:multer.diskStorage({destination:path.join(ROOT,'public','uploads'),filename:(req,file,cb)=>cb(null,id()+path.extname(file.originalname).toLowerCase())}),limits:{fileSize:5*1024*1024},fileFilter:(req,file,cb)=>cb(null,/^image\/(jpeg|png|webp)$|^application\/pdf$/.test(file.mimetype))});

function tokenFor(u){return jwt.sign({id:u.id,role:u.role},JWT_SECRET,{expiresIn:'7d'})}
function auth(req,res,next){try{const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return res.status(401).json({error:'Login required'});req.user=jwt.verify(h.slice(7),JWT_SECRET);next()}catch(e){res.status(401).json({error:'Invalid or expired session'})}}
function role(...roles){return (req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({error:'Not allowed'})}
function audit(admin,action,entity,entityId,details=''){db.prepare("INSERT INTO audit_logs VALUES(?,?,?,?,?,?,?)").run(id(),admin?.id||null,action,entity,entityId,details,now())}
function userPublic(idv){return db.prepare("SELECT id,role,name,mobile,email,status,created_at FROM users WHERE id=?").get(idv)}

app.get('/api/health',(req,res)=>res.json({ok:true,service:'Digital Thekedaar',time:now()}));
app.post('/api/auth/register',async(req,res)=>{try{const {role:rr,name,mobile,email,password}=req.body;if(!['worker','customer'].includes(rr)||!name||!mobile||!password||password.length<6)return res.status(400).json({error:'Role, name, mobile and password (6+ chars) are required'});if(db.prepare('SELECT id FROM users WHERE mobile=? OR (email IS NOT NULL AND email=?)').get(mobile,email||null))return res.status(409).json({error:'Mobile/email already registered'});const uid=id(),hash=await bcrypt.hash(password,12);db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)').run(uid,rr,name,mobile,email||null,hash,'Active',now());if(rr==='worker'){const {category,skills,experience,location,hourly_rate,daily_rate,bio}=req.body;if(!category||!location)return res.status(400).json({error:'Worker category and location are required'});db.prepare('INSERT INTO workers VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(uid,category,skills||'',Number(experience)||0,location,Number(hourly_rate)||0,Number(daily_rate)||0,bio||'','Available','Pending',0,0,'','');}else db.prepare('INSERT INTO customers VALUES(?,?,?,?)').run(uid,req.body.location||'',req.body.address||'');const u=userPublic(uid);res.status(201).json({token:tokenFor(u),user:u});}catch(e){console.error(e);res.status(500).json({error:'Registration failed'})}});
app.post('/api/auth/login',async(req,res)=>{const {identifier,password}=req.body;const u=db.prepare('SELECT * FROM users WHERE mobile=? OR email=?').get(identifier,identifier);if(!u||!u.password_hash||!(await bcrypt.compare(password,u.password_hash)))return res.status(401).json({error:'Invalid login'});if(u.status==='Blocked')return res.status(403).json({error:'Account blocked'});const p=userPublic(u.id);res.json({token:tokenFor(p),user:p});});
app.get('/api/me',auth,(req,res)=>res.json(userPublic(req.user.id)));

app.get('/api/workers',(req,res)=>{const {q,category,location,status}=req.query;let sql=`SELECT w.*,u.name,u.mobile,u.email FROM workers w JOIN users u ON u.id=w.id WHERE u.status!='Blocked'`;const a=[];if(q){sql+=' AND (u.name LIKE ? OR w.skills LIKE ? OR w.category LIKE ?)';a.push('%'+q+'%','%'+q+'%','%'+q+'%')}if(category){sql+=' AND w.category=?';a.push(category)}if(location){sql+=' AND w.location LIKE ?';a.push('%'+location+'%')}if(status){sql+=' AND w.verification_status=?';a.push(status)}sql+=' ORDER BY w.verification_status="Verified" DESC,w.rating DESC,w.reviews DESC';res.json(db.prepare(sql).all(...a))});
app.get('/api/workers/:id',(req,res)=>{const w=db.prepare(`SELECT w.*,u.name,u.mobile,u.email FROM workers w JOIN users u ON u.id=w.id WHERE w.id=?`).get(req.params.id);if(!w)return res.status(404).json({error:'Worker not found'});res.json(w)});

app.get('/api/customers',auth,role('admin'),(req,res)=>res.json(db.prepare(`SELECT u.id,u.name,u.mobile,u.email,u.status,u.created_at,c.location,c.address,COUNT(j.id) jobs FROM users u JOIN customers c ON c.id=u.id LEFT JOIN jobs j ON j.customer_id=c.id GROUP BY u.id ORDER BY u.created_at DESC`).all()));
app.get('/api/jobs',auth,(req,res)=>{let sql=`SELECT j.*,cu.name customer_name,cu.mobile customer_mobile,wu.name worker_name,wu.mobile worker_mobile FROM jobs j JOIN users cu ON cu.id=j.customer_id JOIN users wu ON wu.id=j.worker_id`;const a=[];if(req.user.role!=='admin'){sql+=' WHERE (j.customer_id=? OR j.worker_id=?)';a.push(req.user.id,req.user.id)}sql+=' ORDER BY j.created_at DESC';res.json(db.prepare(sql).all(...a))});
app.post('/api/jobs',auth,role('customer'),(req,res)=>{const {worker_id,title,description,location,work_date,duration_hours,agreed_amount}=req.body;if(!worker_id||!title||!location)return res.status(400).json({error:'Worker, title and location are required'});const w=db.prepare('SELECT id FROM workers WHERE id=? AND verification_status="Verified"').get(worker_id);if(!w)return res.status(400).json({error:'Worker must be verified before hiring'});const jid=id();db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(jid,req.user.id,worker_id,title,description||'',location,work_date||null,Number(duration_hours)||1,Number(agreed_amount)||0,'Pending','Unpaid',now());res.status(201).json(db.prepare('SELECT * FROM jobs WHERE id=?').get(jid))});
app.patch('/api/jobs/:id',auth,(req,res)=>{const j=db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);if(!j)return res.status(404).json({error:'Job not found'});if(req.user.role!=='admin'&&j.customer_id!==req.user.id&&j.worker_id!==req.user.id)return res.status(403).json({error:'Not allowed'});const allowed=['status','payment_status','agreed_amount'];const patch={};for(const k of allowed)if(req.body[k]!==undefined)patch[k]=req.body[k];if(req.user.role==='worker'&&patch.status&&!['Accepted','Rejected','In Progress','Completed'].includes(patch.status))return res.status(400).json({error:'Invalid worker status'});if(req.user.role==='customer'&&patch.status&&!['Cancelled','Completed'].includes(patch.status))return res.status(400).json({error:'Invalid customer status'});const sets=Object.keys(patch).map(k=>`${k}=?`).join(',');if(sets)db.prepare(`UPDATE jobs SET ${sets} WHERE id=?`).run(...Object.values(patch),j.id);res.json(db.prepare('SELECT * FROM jobs WHERE id=?').get(j.id))});

app.post('/api/reviews',auth,role('customer'),(req,res)=>{const {job_id,rating,comment}=req.body;const j=db.prepare('SELECT * FROM jobs WHERE id=? AND customer_id=? AND status="Completed"').get(job_id,req.user.id);if(!j)return res.status(400).json({error:'Only your completed jobs can be reviewed'});const r=Math.max(1,Math.min(5,Number(rating)));db.prepare('INSERT INTO reviews VALUES(?,?,?,?,?,?,?)').run(id(),job_id,req.user.id,j.worker_id,r,comment||'',now());const avg=db.prepare('SELECT AVG(rating) avg,COUNT(*) c FROM reviews WHERE worker_id=?').get(j.worker_id);db.prepare('UPDATE workers SET rating=?,reviews=? WHERE id=?').run(Number(avg.avg.toFixed(2)),avg.c,j.worker_id);res.status(201).json({ok:true})});

app.post('/api/complaints',auth,(req,res)=>{const {job_id,subject,message}=req.body;if(!subject||!message)return res.status(400).json({error:'Subject and message required'});const cid=id();db.prepare('INSERT INTO complaints VALUES(?,?,?,?,?,?,?)').run(cid,req.user.id,job_id||null,subject,message,'Open',now());res.status(201).json({id:cid})});
app.get('/api/complaints',auth,role('admin'),(req,res)=>res.json(db.prepare(`SELECT c.*,u.name,u.mobile FROM complaints c JOIN users u ON u.id=c.user_id ORDER BY c.created_at DESC`).all()));

app.post('/api/payments/demo',auth,role('customer'),(req,res)=>{const j=db.prepare('SELECT * FROM jobs WHERE id=? AND customer_id=?').get(req.body.job_id,req.user.id);if(!j)return res.status(404).json({error:'Job not found'});const pid=id();db.prepare('INSERT INTO payments VALUES(?,?,?,?,?,?)').run(pid,j.id,j.agreed_amount,'Demo','Paid','DEMO-'+Date.now(),now());db.prepare('UPDATE jobs SET payment_status="Paid" WHERE id=?').run(j.id);res.json({ok:true,payment_id:pid,note:'Demo payment recorded. Connect Razorpay/Stripe credentials for live payments.'})});

app.get('/api/admin/stats',auth,role('admin'),(req,res)=>{const q=x=>db.prepare(x).get().c;const totalValue=db.prepare("SELECT COALESCE(SUM(agreed_amount),0) v FROM jobs WHERE status='Completed'").get().v;res.json({workers:q("SELECT COUNT(*) c FROM workers"),verifiedWorkers:q("SELECT COUNT(*) c FROM workers WHERE verification_status='Verified'"),pendingWorkers:q("SELECT COUNT(*) c FROM workers WHERE verification_status='Pending'"),customers:q("SELECT COUNT(*) c FROM customers"),jobs:q("SELECT COUNT(*) c FROM jobs"),pendingJobs:q("SELECT COUNT(*) c FROM jobs WHERE status='Pending'"),completedJobs:q("SELECT COUNT(*) c FROM jobs WHERE status='Completed'"),complaints:q("SELECT COUNT(*) c FROM complaints WHERE status!='Resolved'"),bookingValue:totalValue})});
app.get('/api/admin/workers',auth,role('admin'),(req,res)=>res.json(db.prepare(`SELECT w.*,u.name,u.mobile,u.email,u.status,u.created_at FROM workers w JOIN users u ON u.id=w.id ORDER BY u.created_at DESC`).all()));
app.patch('/api/admin/workers/:id',auth,role('admin'),(req,res)=>{const {verification_status,status}=req.body;if(verification_status)db.prepare('UPDATE workers SET verification_status=? WHERE id=?').run(verification_status,req.params.id);if(status)db.prepare('UPDATE users SET status=? WHERE id=?').run(status,req.params.id);audit(req.user,'WORKER_UPDATE','worker',req.params.id,JSON.stringify(req.body));res.json({ok:true})});
app.patch('/api/admin/users/:id',auth,role('admin'),(req,res)=>{if(!['Active','Blocked'].includes(req.body.status))return res.status(400).json({error:'Invalid status'});db.prepare('UPDATE users SET status=? WHERE id=?').run(req.body.status,req.params.id);audit(req.user,'USER_STATUS','user',req.params.id,req.body.status);res.json({ok:true})});
app.get('/api/admin/reviews',auth,role('admin'),(req,res)=>res.json(db.prepare(`SELECT r.*,cu.name customer_name,wu.name worker_name FROM reviews r JOIN users cu ON cu.id=r.customer_id JOIN users wu ON wu.id=r.worker_id ORDER BY r.created_at DESC`).all()));
app.get('/api/admin/payments',auth,role('admin'),(req,res)=>res.json(db.prepare('SELECT * FROM payments ORDER BY created_at DESC').all()));
app.get('/api/admin/audit',auth,role('admin'),(req,res)=>res.json(db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200').all()));

app.post('/api/workers/kyc',auth,role('worker'),upload.single('document'),(req,res)=>{if(!req.file)return res.status(400).json({error:'Document file required'});const p='/uploads/'+req.file.filename;db.prepare('UPDATE workers SET kyc_doc=?,verification_status="Pending" WHERE id=?').run(p,req.user.id);res.json({ok:true,file:p})});

app.post('/api/admin/reset-demo',auth,role('admin'),(req,res)=>{if(req.body.confirm!=='RESET')return res.status(400).json({error:'Confirmation required'});db.prepare('DELETE FROM reviews').run();db.prepare('DELETE FROM payments').run();db.prepare('DELETE FROM complaints').run();db.prepare('DELETE FROM jobs').run();db.prepare('DELETE FROM audit_logs').run();audit(req.user,'RESET_DEMO','system',null,'Demo transaction data reset');res.json({ok:true})});

app.get('/admin',(req,res)=>res.sendFile(path.join(ROOT,'public','admin.html')));
app.use((req,res)=>{if(req.path.startsWith('/api/'))return res.status(404).json({error:'API route not found'});res.sendFile(path.join(ROOT,'public','index.html'))});
app.listen(PORT,()=>console.log(`Digital Thekedaar: http://localhost:${PORT}`));
