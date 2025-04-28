import { DataTypes, Sequelize } from "sequelize";


const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:', //path to local sqlite database

});

const Queue = sequelize.define('Queue',{
    queuePOS:{
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement:true
    },
    songID:{
        type: DataTypes.INTEGER
    },
    path: {
        type: DataTypes.STRING
    },
},{
    tableName: 'queue'
})

sequelize.sync()
    .then( () => {console.log("DB connection working!" + " DB Queue");})
    .catch(error => console.log("DB connection failed", error));
  
  
export {Queue};