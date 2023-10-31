import { Injectable,OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool, Client } from 'pg';
import { WinstonService} from '../winston.service'
//import retry from 'async-retry';
import { CreateUserDto } from '../users/createUser.dto';
import { HashService } from '../authentification/hash.service';
import { RegistrationStatus } from './registration-status.enum';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy{
    private pool: Pool;

    constructor (private winston :WinstonService,
                 private auth: HashService){
        this.pool = new Pool({
            user: process.env.POSTGRES_USER,
            host: process.env.POSTGRES_HOST,
            database: process.env.POSTGRES_DB,
            password: process.env.POSTGRES_PASSWORD,
            port: parseInt(process.env.DATABASE_PORT, 10),
        });
    }

    async getClient(): Promise<Client | null>{
        try{
            const client = await this.pool.connect();
            return client;
        }catch(error){
            this.winston.error('Failed to connect client', error);
            return null;
        }
    }

    async registerClient(createUserDto: CreateUserDto): Promise<RegistrationStatus>{
        const  client = await this.getClient();
        if (!client)
            return RegistrationStatus.ErrorDatabase;
        try {
            const query = "INSERT INTO public.users (username, password, image_index) VALUES($1, $2, $3);";
            const password = await this.auth.hashPassword(createUserDto.password);
            this.winston.log('Hashed password for user: ' + createUserDto.username + ' : [' + password + ']');
            
            const params = [createUserDto.username, password, 0];
            const result = await client.query(query, params);
            this.winston.log(createUserDto.username + ' client regisered.');
        } catch (error) {
            this.winston.error('Database query error: cant register', error.message);
            return RegistrationStatus.AlreadyRegistered;
        }
        this.releaseClient(client);
        return RegistrationStatus.Success;
    }

    async loginClient(createUserDto: CreateUserDto) : Promise<boolean>{
        const  client = await this.getClient();
        if (!client)
            return false;
        try {
            const query = `SELECT password FROM users WHERE username = $1`;
            const params = [createUserDto.username];
            const result = await client.query(query, params);
            if (result.length == 0){
                return false;
            }else{
                const value =  await this.auth.verifyPassword(result.rows[0].password, createUserDto.password);
                this.releaseClient(client);
                return value;
            }
        } catch (error) {
            this.winston.error('Database query error: can\'t find user to log in', error);
            return false;
        }
    }
    //INSERT INTO penguins(id, name) VALUES ('1', 'ecamara')

    releaseClient(client){
        client.release();
    }

    async onModuleInit(): Promise<void> {
        for (let i = 0; i < 5; i++) { // number of attempts
            try {
              await this.pool.connect();
              this.winston.log('Connected to the database');
              break; // connection is successful, break out of the loop
            } catch (error) {
              this.winston.error('Could not connect to the database, retrying in 5 seconds', error);
              await new Promise(res => setTimeout(res, 5000)); // wait for 5 seconds before trying again
            }
        }
    }

    async onModuleDestroy() {
        await this.pool.end();
    }
}