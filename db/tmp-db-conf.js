import { DataTypes, Sequelize } from "sequelize";


const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:', //path to local sqlite database

});

const Songs = sequelize.define('Songs',{
    id:{
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement:true
    },
    title:{
        type: DataTypes.STRING
    },
    artists: {
        type: DataTypes.STRING
    },
    album:{
        type: DataTypes.STRING
    },
    path: {
        type: DataTypes.STRING
    },
},{
    tableName: 'songs'
})

sequelize.sync()
    .then( () => {console.log("DB connection working!");})
    .catch(error => console.log("DB connection failed", error));
  
  
export {Songs};